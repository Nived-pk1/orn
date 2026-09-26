/**
 * INV-18: applying a ChangeSet gives exactly what a rebuild gives. The full random-command property
 * test is P-07 (step 1.11); this file covers named scenarios plus a seeded random walk over edits.
 */
import { applyPatches } from 'immer';
import { describe, expect, it } from 'vitest';
import { RECORD_ID_PREFIX, RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind } from '../schema';
import { assembleChangeSet } from '../dataset';
import { referenceEngine } from '../references';
import { commit, loadFixtureState, must, remove, type Tables } from '../../test-support/state-fixture';
import type { CoreIndexes, HierarchyKind } from './contracts';
import { coreIndexEngine } from './engine';
import { foldedNamesOf } from './names';

const base = loadFixtureState('maximal-valid');
const HIERARCHIES: readonly HierarchyKind[] = ['class', 'concept', 'named_reaction', 'topic'];
const all = (state: CanonicalState): AnyRecord[] =>
  RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Record<string, AnyRecord>));

/** Every observable answer for the IDs and names ever seen, so a stale leftover cannot hide. */
class Universe {
  readonly ids = new Set<string>();
  readonly names = new Set<string>();
  absorb(state: CanonicalState): void {
    for (const record of all(state)) {
      this.ids.add(record.id);
      for (const ref of referenceEngine.extract(record)) this.ids.add(ref.targetId);
      for (const name of foldedNamesOf(record)) this.names.add(name);
    }
  }
  snapshot(ix: CoreIndexes): unknown {
    return {
      revision: ix.revision,
      referrers: [...this.ids].sort().map((id) => [id, ix.referrersOf(id), ix.get(id)]),
      names: RECORD_KINDS.flatMap((kind) => [...this.names].sort().map((name) => [kind, name, ix.byFoldedName(kind, name)])),
      hierarchy: HIERARCHIES.flatMap((kind) =>
        [...this.ids].sort().map((id) => [kind, id, ix.ancestorsOf(kind, id), ix.descendantsOf(kind, id)]),
      ),
    };
  }
}

function step(universe: Universe, ix: CoreIndexes, before: CanonicalState, recipe: (t: Tables) => void, cause: 'command' | 'undo' = 'command') {
  const { after, changes } = commit(before, ix.revision + 1, recipe, cause);
  universe.absorb(after);
  const next = coreIndexEngine.apply(ix, changes, after);
  expect(universe.snapshot(next)).toEqual(universe.snapshot(coreIndexEngine.build(after, changes.revision)));
  return { next, after, changes };
}

describe('apply ≡ build (INV-18) — scenarios', () => {
  it('create, rename, retarget, reparent, delete, recreate', () => {
    const universe = new Universe();
    universe.absorb(base);
    let ix = coreIndexEngine.build(base);
    let state = base;
    const species = must(Object.values(base.records.species)[0]);
    const classes = Object.values(base.records.class);
    const [c0, c1] = [must(classes[0]), must(classes[1])];
    const run = (recipe: (t: Tables) => void) => {
      const out = step(universe, ix, state, recipe);
      ix = out.next;
      state = out.after;
    };

    run((t) => {
      t.species['spc_new-one'] = { ...species, id: 'spc_new-one', classIds: [c0.id] };
    });
    expect(ix.referrersOf(c0.id).some((ref) => ref.owner.id === 'spc_new-one')).toBe(true);

    run((t) => {
      (t.species['spc_new-one'] as { classIds: string[] }).classIds = [c1.id];
    });
    expect(ix.referrersOf(c0.id).some((ref) => ref.owner.id === 'spc_new-one')).toBe(false);
    expect(ix.referrersOf(c1.id).some((ref) => ref.owner.id === 'spc_new-one')).toBe(true);

    run((t) => {
      (t.species['spc_new-one'] as { names: unknown }).names = { canonical: 'Brand New', common: [], aliases: ['BN'] };
    });
    expect(ix.byFoldedName('species', 'brand new')).toEqual([{ kind: 'species', id: 'spc_new-one' }]);
    expect(ix.byFoldedName('species', 'bn')).toEqual([{ kind: 'species', id: 'spc_new-one' }]);

    run((t) => {
      (t.class[c1.id] as { parentIds: string[] }).parentIds = [c0.id];
    });
    expect(ix.ancestorsOf('class', c1.id)).toContain(c0.id);
    expect(ix.descendantsOf('class', c0.id)).toContain(c1.id);

    run((t) => {
      remove(t, 'species', 'spc_new-one');
    });
    expect(ix.get('spc_new-one')).toBeUndefined();
    expect(ix.byFoldedName('species', 'brand new')).toEqual([]);

    run((t) => {
      t.species['spc_new-one'] = { ...species, id: 'spc_new-one', classIds: [] };
    });
    expect(ix.referrersOf(c1.id).some((ref) => ref.owner.id === 'spc_new-one')).toBe(false);
  });

  it('a deleted record that others still reference leaves those referrers in place', () => {
    const universe = new Universe();
    universe.absorb(base);
    const ix = coreIndexEngine.build(base);
    const target = must(Object.values(base.records.class)[0]);
    const before = ix.referrersOf(target.id);
    expect(before.length).toBeGreaterThan(0);
    const { next } = step(universe, ix, base, (t) => {
      remove(t, 'class', target.id);
    });
    expect(next.referrersOf(target.id)).toEqual(before);
    expect(next.get(target.id)).toBeUndefined();
  });

  it('undo (inverse patches as a new commit) restores the original answers', () => {
    const universe = new Universe();
    universe.absorb(base);
    const ix0 = coreIndexEngine.build(base);
    const species = must(Object.values(base.records.species)[0]);
    const forward = commit(base, 1, (t) => {
      remove(t, 'species', species.id);
    });
    universe.absorb(forward.after);
    const ix1 = coreIndexEngine.apply(ix0, forward.changes, forward.after);
    const restored = applyPatches(forward.after, forward.changes.inversePatches);
    const undo = assembleChangeSet({
      revision: 2,
      label: 'undo',
      cause: 'undo',
      before: forward.after,
      after: restored,
      patches: forward.changes.inversePatches,
      inversePatches: forward.changes.patches,
    });
    const ix2 = coreIndexEngine.apply(ix1, undo, restored);
    expect(universe.snapshot(ix2)).toEqual(universe.snapshot(coreIndexEngine.build(restored, 2)));
    expect(ix2.get(species.id)).toEqual(species);
  });

  it('an empty change advances the revision and changes nothing else', () => {
    const universe = new Universe();
    universe.absorb(base);
    const ix = coreIndexEngine.build(base);
    const { next } = step(universe, ix, base, () => undefined);
    expect(next.revision).toBe(1);
  });
});

describe('apply — contract behaviour', () => {
  it('a replace ChangeSet or a revision gap rebuilds and leaves the previous handle usable', () => {
    const ix = coreIndexEngine.build(base);
    const species = must(Object.values(base.records.species)[0]);
    for (const [revision, cause] of [[1, 'replace'], [5, 'command']] as const) {
      const { after, changes } = commit(base, revision, (t) => {
        remove(t, 'species', species.id);
      }, cause);
      const next = coreIndexEngine.apply(ix, changes, after);
      expect(next.revision).toBe(revision);
      expect(next.get(species.id)).toBeUndefined();
      expect(ix.get(species.id)).toBe(species);
    }
  });

  it('a stale handle throws instead of answering from data that moved on', () => {
    const ix = coreIndexEngine.build(base);
    const species = must(Object.values(base.records.species)[0]);
    const { after, changes } = commit(base, 1, (t) => {
      remove(t, 'species', species.id);
    });
    coreIndexEngine.apply(ix, changes, after);
    expect(() => ix.referrersOf('spc_x')).toThrow(/Stale/);
    expect(() => ix.get(species.id)).toThrow(/Stale/);
    expect(() => ix.byFoldedName('species', 'x')).toThrow(/Stale/);
    expect(() => ix.ancestorsOf('class', 'cls_x')).toThrow(/Stale/);
    expect(() => coreIndexEngine.apply(ix, changes, after)).toThrow(/Stale/);
  });

  it('arrays handed out earlier stay valid snapshots after later applies', () => {
    const ix = coreIndexEngine.build(base);
    const target = must(Object.values(base.records.class)[0]);
    const held = ix.referrersOf(target.id);
    const copy = [...held];
    const species = must(Object.values(base.records.species)[0]);
    const { after, changes } = commit(base, 1, (t) => {
      t.species['spc_extra'] = { ...species, id: 'spc_extra', classIds: [target.id] };
    });
    const next = coreIndexEngine.apply(ix, changes, after);
    expect(held).toEqual(copy);
    expect(next.referrersOf(target.id)).toHaveLength(copy.length + 1);
  });

  it('rejects a ChangeSet naming a record the next state lacks, and foreign handles', () => {
    const ix = coreIndexEngine.build(base);
    const species = must(Object.values(base.records.species)[0]);
    const { changes } = commit(base, 1, (t) => {
      t.species['spc_ghost'] = { ...species, id: 'spc_ghost' };
    });
    expect(() => coreIndexEngine.apply(ix, changes, base)).toThrow(/spc_ghost/);
    const foreign = { revision: 0 } as unknown as CoreIndexes;
    expect(() => coreIndexEngine.apply(foreign, changes, base)).toThrow(TypeError);
  });
});

/** Small deterministic generator (no Math.random in tests that must reproduce). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('apply ≡ build (INV-18) — seeded random walk', () => {
  it.each([1, 2, 3, 4])('seed %i: 100 random edits, compared after every step', (seed) => {
    const rand = lcg(seed);
    const pick = <T,>(items: readonly T[]): T => must(items[Math.floor(rand() * items.length)]);
    const words = ['alpha', 'beta', 'Gamma', 'delta-x', 'É', 'alpha'];
    const universe = new Universe();
    universe.absorb(base);
    let state = base;
    let ix = coreIndexEngine.build(base);
    let counter = 0;

    for (let i = 0; i < 100; i++) {
      const records = all(state);
      const op = Math.floor(rand() * 5);
      const target = pick(records);
      const classIds = Object.keys(state.records.class);
      const recipe = (t: Tables): void => {
        const table = t[target.kind] as Record<string, Record<string, unknown>>;
        const record = table[target.id];
        if (record === undefined) return;
        if (op === 0) {
          const id = `${RECORD_ID_PREFIX[target.kind as RecordKind]}_gen-${counter++}`;
          table[id] = { ...record, id };
        } else if (op === 1) {
          Reflect.deleteProperty(table, target.id);
        } else if (op === 2) {
          const word = pick(words);
          if (typeof record['name'] === 'string') record['name'] = word;
          else if (typeof record['names'] === 'object') record['names'] = { canonical: word, common: [], aliases: [pick(words)] };
        } else if (op === 3 && 'parentIds' in record && target.kind === 'class') {
          record['parentIds'] = rand() < 0.3 ? [] : [pick(classIds), pick(classIds)];
        } else if (op === 4 && 'classIds' in record) {
          record['classIds'] = rand() < 0.3 ? [] : [pick(classIds)];
        }
      };
      const out = step(universe, ix, state, recipe);
      ix = out.next;
      state = out.after;
    }
    expect(counter).toBeGreaterThan(0);
  });
});
