/**
 * ChangeSet assembly: classification from Immer patches, with the diff fallback for coarse patches.
 * The store (step 1.9) is the real producer; these tests drive it with produceWithPatches directly.
 */
import { readFileSync } from 'node:fs';
import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AnyRecord, CanonicalState, DatasetDocument } from '../schema';
import { assembleChangeSet, diffStates, type ChangeSetInput } from './changeset';
import { documentToState } from './document';

beforeAll(() => enablePatches());

const doc = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/schema/v2/minimal-valid.orn.json', import.meta.url), 'utf8'),
) as DatasetDocument;
const base = ((): CanonicalState => {
  const result = documentToState(doc);
  if (!result.ok) throw new Error('fixture has duplicates');
  return result.state;
})();

type Mutable = { meta: CanonicalState['meta']; records: Record<string, Record<string, AnyRecord>> };

function change(recipe: (draft: Mutable) => void, cause: ChangeSetInput['cause'] = 'command') {
  const [after, patches, inversePatches] = produceWithPatches(base, (draft) => recipe(draft as unknown as Mutable));
  const set = assembleChangeSet({ revision: 1, label: 'test', cause, before: base, after, patches, inversePatches });
  return { after, patches, inversePatches, set };
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('fixture is missing an expected record');
  return value;
}

/** A mutable view of one kind's table inside an Immer draft. */
function tbl(d: Mutable, kind: string): Record<string, AnyRecord> {
  return must(d.records[kind]);
}

const species = Object.values(base.records.species);
const [s1, s2] = [must(species[0]), must(species[1])];
const ref = (kind: string, id: string) => ({ kind, id });

describe('assembleChangeSet from patches', () => {
  it('classifies an update deep inside a record as updated only', () => {
    const { set } = change((d) => {
      (tbl(d, 'species')[s1.id] as { tags: string[] }).tags.push('x');
    });
    expect(set.updated).toEqual([ref('species', s1.id)]);
    expect(set.created).toEqual([]);
    expect(set.deleted).toEqual([]);
  });

  it('classifies whole-record replace as updated, add as created, delete as deleted', () => {
    const fresh = { ...s2, id: 'spc_brand-new' } as AnyRecord;
    const { set } = change((d) => {
      tbl(d, 'species')[s1.id] = { ...s1, tags: ['changed'] } as AnyRecord;
      tbl(d, 'species')['spc_brand-new'] = fresh;
      Reflect.deleteProperty(tbl(d, 'species'), s2.id);
    });
    expect(set.updated).toEqual([ref('species', s1.id)]);
    expect(set.created).toEqual([ref('species', 'spc_brand-new')]);
    expect(set.deleted).toEqual([ref('species', s2.id)]);
  });

  it('collapses create-then-delete in one change to nothing', () => {
    const fresh = { ...s2, id: 'spc_transient' } as AnyRecord;
    const { set } = change((d) => {
      tbl(d, 'species')['spc_transient'] = fresh;
      Reflect.deleteProperty(tbl(d, 'species'), 'spc_transient');
    });
    expect(set.created).toEqual([]);
    expect(set.updated).toEqual([]);
    expect(set.deleted).toEqual([]);
  });

  it('treats delete-then-recreate of the same ID as updated', () => {
    const { set } = change((d) => {
      Reflect.deleteProperty(tbl(d, 'species'), s1.id);
      tbl(d, 'species')[s1.id] = { ...s1, tags: ['again'] } as AnyRecord;
    });
    expect(set.updated).toEqual([ref('species', s1.id)]);
    expect(set.created).toEqual([]);
    expect(set.deleted).toEqual([]);
  });

  it('reports each record once however many patches touch it', () => {
    const { set, patches } = change((d) => {
      const r = tbl(d, 'species')[s1.id] as { tags: string[] };
      r.tags.push('a');
      r.tags.push('b');
    });
    expect(patches.length).toBeGreaterThan(1);
    expect(set.updated).toHaveLength(1);
  });

  it('sorts lists by kind order then ID, independent of patch order', () => {
    const conceptId = must(Object.keys(base.records.concept)[0]);
    const a = change((d) => {
      (tbl(d, 'concept')[conceptId] as { tags: string[] }).tags.push('x');
      (tbl(d, 'species')[s1.id] as { tags: string[] }).tags.push('x');
      (tbl(d, 'species')[s2.id] as { tags: string[] }).tags.push('x');
    }).set;
    const b = change((d) => {
      (tbl(d, 'species')[s2.id] as { tags: string[] }).tags.push('x');
      (tbl(d, 'species')[s1.id] as { tags: string[] }).tags.push('x');
      (tbl(d, 'concept')[conceptId] as { tags: string[] }).tags.push('x');
    }).set;
    expect(a.updated).toEqual(b.updated);
    expect(a.updated.map((r) => r.kind)).toEqual(['concept', 'species', 'species']);
    const speciesIds = a.updated.filter((r) => r.kind === 'species').map((r) => r.id);
    expect(speciesIds).toEqual([...speciesIds].sort());
  });

  it('ignores meta patches for the record lists but keeps them in patches', () => {
    const { set } = change((d) => {
      d.meta = { ...d.meta, updatedAt: '2031-01-01T00:00:00.000Z' };
    });
    expect([set.created, set.updated, set.deleted]).toEqual([[], [], []]);
    expect(set.patches.some((p) => p.path[0] === 'meta')).toBe(true);
  });

  it('carries revision, label, cause and the patches through unchanged, and they round-trip (INV-27)', () => {
    const { set, after, patches, inversePatches } = change((d) => {
      Reflect.deleteProperty(tbl(d, 'species'), s1.id);
    }, 'undo');
    expect(set).toMatchObject({ revision: 1, label: 'test', cause: 'undo' });
    expect(set.patches).toBe(patches);
    expect(set.inversePatches).toBe(inversePatches);
    expect(applyPatches(after, inversePatches)).toEqual(base);
  });

  it('for an undo, swaps created and deleted relative to the original change', () => {
    const fresh = { ...s2, id: 'spc_undo-me' } as AnyRecord;
    const forward = change((d) => {
      tbl(d, 'species')['spc_undo-me'] = fresh;
    });
    const undone = assembleChangeSet({
      revision: 2,
      label: 'undo',
      cause: 'undo',
      before: forward.after,
      after: base,
      patches: forward.inversePatches,
      inversePatches: forward.patches,
    });
    expect(forward.set.created).toEqual([ref('species', 'spc_undo-me')]);
    expect(undone.deleted).toEqual([ref('species', 'spc_undo-me')]);
    expect(undone.created).toEqual([]);
  });

  it('rejects a negative or fractional revision (programmer error)', () => {
    const input = { before: base, after: base, label: 'x', cause: 'command', patches: [], inversePatches: [] } as const;
    expect(() => assembleChangeSet({ ...input, revision: -1 })).toThrow(RangeError);
    expect(() => assembleChangeSet({ ...input, revision: 1.5 })).toThrow(RangeError);
  });

  it('returns empty lists for a no-op', () => {
    const { set } = change(() => undefined);
    expect([set.created, set.updated, set.deleted, set.patches]).toEqual([[], [], [], []]);
  });
});

describe('assembleChangeSet fallback to state diff', () => {
  it('uses the diff when a patch replaces a whole table', () => {
    const coarse: Patch[] = [{ op: 'replace', path: ['records', 'species'], value: {} }];
    const { after } = change((d) => {
      d.records['species'] = {};
    });
    const set = assembleChangeSet({ revision: 1, label: 'x', cause: 'command', before: base, after, patches: coarse, inversePatches: [] });
    expect(set.deleted).toEqual(species.map((s) => ref('species', s.id)).sort((a, b) => (a.id < b.id ? -1 : 1)));
  });

  it('uses the diff when a patch replaces the whole state', () => {
    const { after } = change((d) => {
      Reflect.deleteProperty(tbl(d, 'species'), s1.id);
    });
    const set = assembleChangeSet({ revision: 1, label: 'x', cause: 'command', before: base, after, patches: [{ op: 'replace', path: [], value: after }], inversePatches: [] });
    expect(set.deleted).toEqual([ref('species', s1.id)]);
  });

  it("always diffs for cause 'replace', whatever the patches say", () => {
    const { after } = change((d) => {
      Reflect.deleteProperty(tbl(d, 'species'), s1.id);
    });
    const set = assembleChangeSet({ revision: 3, label: 'import', cause: 'replace', before: base, after, patches: [], inversePatches: [] });
    expect(set.deleted).toEqual([ref('species', s1.id)]);
  });
});

describe('diffStates', () => {
  it('finds nothing between identical states and skips unchanged tables by identity', () => {
    expect(diffStates(base, base)).toEqual({ created: [], updated: [], deleted: [] });
  });

  it('agrees with the patch classification on a mixed change', () => {
    const fresh = { ...s2, id: 'spc_diff-new' } as AnyRecord;
    const { after, set } = change((d) => {
      tbl(d, 'species')[s1.id] = { ...s1, tags: ['changed'] } as AnyRecord;
      tbl(d, 'species')['spc_diff-new'] = fresh;
      Reflect.deleteProperty(tbl(d, 'species'), s2.id);
    });
    expect(diffStates(base, after)).toEqual({ created: set.created, updated: set.updated, deleted: set.deleted });
  });
});
