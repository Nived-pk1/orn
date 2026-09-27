/**
 * Cross-record indexes (step 2.1): every answer checked against a scan-based oracle, apply ≡ build
 * (INV-18, extended P-07), stale handles, and the index halves of ADV-051, ADV-052 and ADV-057.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '../dataset';
import { REAGENT_FAMILIES, RECORD_ID_PREFIX, RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordRef } from '../schema';
import { buildDemoDocument } from '@/test-support/demo';
import { derivedSnapshot, idsOf, oracle } from '@/test-support/index-snapshot';
import { commit, loadFixtureState, must, remove, type Tables } from '@/test-support/state-fixture';
import type { ReadonlyIndexes } from './contracts';
import { indexEngine } from './full';

const demo = (() => {
  const result = documentToState(buildDemoDocument());
  if (!result.ok) throw new Error('duplicate IDs');
  return result.state;
})();
const maximal = loadFixtureState('maximal-valid');
const refOf = (kind: RecordRef['kind'], id: string): RecordRef => ({ kind, id });
const ids = (refs: readonly RecordRef[]): string[] => refs.map((r) => r.id);
const both = [false, true] as const;

/** Compares one index handle with the oracle over every ID, in every mode. */
function expectMatchesOracle(ix: ReadonlyIndexes, state: CanonicalState, universe: Iterable<string>): void {
  const o = oracle(state);
  const key = (x: { reactionId: string; participantId?: string; outcomeId?: string; productId?: string }): string[] => [
    x.reactionId,
    x.participantId ?? '',
    x.outcomeId ?? '',
    x.productId ?? '',
  ];
  const byKey = <T extends Parameters<typeof key>[0]>(list: T[]) =>
    [...list].sort((a, b) => {
      const [ka, kb] = [key(a), key(b)];
      const at = ka.findIndex((part, i) => part !== kb[i]);
      return at < 0 ? 0 : (ka[at] as string) < (kb[at] as string) ? -1 : 1;
    });
  expect(ix.anchors().map((a) => a.id)).toEqual(o.anchors());
  for (const family of REAGENT_FAMILIES) expect(ix.reactionsByReagentFamily(family)).toEqual(o.reactionsByFamily(family));
  for (const id of universe) {
    const ref = refOf('species', id);
    const any = id as never;
    const label = `for ${id}`;
    expect(ix.participationsOf(ref), label).toEqual(byKey(o.participationsOf(id)));
    expect(ix.productionsOf(ref), label).toEqual(byKey(o.productionsOf(id)));
    expect(ix.reactionsByReagent(any), label).toEqual(o.reactionsByReagent(id));
    expect(ix.reactionsByTransformation(any), label).toEqual(o.reactionsByNamed(id, false).length >= 0 ? expectedByTransformation(state, id) : []);
    expect(ix.reactionsByMechanism(any), label).toEqual(o.reactionsByMechanism(id));
    for (const on of both) {
      expect(ix.reactionsByNamedReaction(any, { includeDescendants: on }), label).toEqual(o.reactionsByNamed(id, on));
      expect(ix.reactionsByConcept(any, { includeDescendants: on }), label).toEqual(o.reactionsByConcept(id, on));
      expect(ids(ix.speciesInClass(any, { transitive: on })), label).toEqual(o.speciesInClass(id, on));
      expect(ids(ix.recordsInTopic(any, { transitive: on })), label).toEqual(o.recordsInTopic(id, on));
    }
    expect(ix.topicsOf(ref), label).toEqual(o.topicsOf(id));
    expect(ids(ix.relationshipsOf(ref)), label).toEqual(o.relationshipsOf(id));
    expect(ids(ix.caveatsFor(ref)), label).toEqual(o.caveatsFor(id));
    expect(ix.displayOf(ref), label).toEqual(o.displayOf(id));
  }
}

function expectedByTransformation(state: CanonicalState, id: string): string[] {
  return Object.values(state.records.reaction)
    .filter((r) => (r.transformationIds as string[]).includes(id))
    .map((r) => r.id)
    .sort();
}

describe('cross-record indexes agree with a scan of the state', () => {
  it.each([
    ['demo', demo],
    ['maximal fixture', maximal],
  ] as const)('%s: every answer for every ID equals the oracle', (_name, state) => {
    const ix = indexEngine.build(state, 3);
    expect(ix.revision).toBe(3);
    expectMatchesOracle(ix, state, idsOf(state));
  });

  it('the demo exercises each index (the comparison is not vacuous)', () => {
    const ix = indexEngine.build(demo);
    const nonEmpty = (n: number) => expect(n).toBeGreaterThan(0);
    nonEmpty(ix.anchors().length);
    nonEmpty(REAGENT_FAMILIES.filter((f) => ix.reactionsByReagentFamily(f).length > 0).length);
    const probe = (pick: (id: string) => number) => nonEmpty([...idsOf(demo)].filter((id) => pick(id) > 0).length);
    probe((id) => ix.participationsOf(refOf('species', id)).length);
    probe((id) => ix.productionsOf(refOf('species', id)).length);
    probe((id) => ix.reactionsByReagent(id as never).length);
    probe((id) => ix.reactionsByNamedReaction(id as never, { includeDescendants: true }).length);
    probe((id) => ix.reactionsByTransformation(id as never).length);
    probe((id) => ix.reactionsByConcept(id as never, { includeDescendants: true }).length);
    probe((id) => ix.reactionsByMechanism(id as never).length);
    probe((id) => ix.speciesInClass(id as never, { transitive: true }).length);
    probe((id) => ix.recordsInTopic(id as never, { transitive: true }).length);
    probe((id) => ix.topicsOf(refOf('species', id)).length);
    probe((id) => ix.relationshipsOf(refOf('reaction', id)).length);
    probe((id) => ix.caveatsFor(refOf('reaction', id)).length);
    probe((id) => (ix.displayOf(refOf('species', id)) === undefined ? 0 : 1));
  });

  it('descendants are included only on request (named reactions, concepts, classes, topics)', () => {
    const ix = indexEngine.build(demo);
    const family = Object.values(demo.records.named_reaction).find((n) => ix.descendantsOf('named_reaction', n.id).length > 0);
    if (family !== undefined) {
      const direct = ix.reactionsByNamedReaction(family.id, { includeDescendants: false });
      const rolled = ix.reactionsByNamedReaction(family.id, { includeDescendants: true });
      expect(rolled.length).toBeGreaterThanOrEqual(direct.length);
      for (const id of direct) expect(rolled).toContain(id);
    }
    const parentClass = Object.values(demo.records.class).find((c) => ix.descendantsOf('class', c.id).length > 0);
    const hub = must(parentClass);
    const direct = ids(ix.speciesInClass(hub.id, { transitive: false }));
    const rolled = ids(ix.speciesInClass(hub.id, { transitive: true }));
    expect(rolled.length).toBeGreaterThan(direct.length);
    for (const id of direct) expect(rolled).toContain(id);
  });
});

describe('ADV-051 same compound twice in one reaction — participations part', () => {
  const RXN = 'rxn_ethanol-to-ethanal-pcc';
  const ETHANOL = refOf('species', 'spc_ethanol');

  it('twice as reactant: two participations with distinct IDs, none dropped or merged (INV-26)', () => {
    const { after } = commit(demo, 1, (t) => {
      const reaction = t.reaction[RXN] as { participants: { id: string; ref: unknown; role: string }[] };
      const first = must(reaction.participants.find((p) => (p.ref as { id: string }).id === ETHANOL.id));
      reaction.participants.push({ ...first, id: 'prt_ethanol-to-ethanal-pcc-extra' });
    });
    const inRxn = indexEngine.build(after).participationsOf(ETHANOL).filter((p) => p.reactionId === RXN);
    expect(inRxn).toHaveLength(2);
    expect(new Set(inRxn.map((p) => p.participantId)).size).toBe(2);
  });

  it('reactant that is also a product: one participation and one production, both kept', () => {
    const { after } = commit(demo, 1, (t) => {
      const reaction = t.reaction[RXN] as { outcomes: { products: { ref: unknown }[] }[] };
      must(must(reaction.outcomes[0]).products[0]).ref = { kind: 'species', id: ETHANOL.id };
    });
    const ix = indexEngine.build(after);
    expect(ix.participationsOf(ETHANOL).filter((p) => p.reactionId === RXN)).toHaveLength(1);
    expect(ix.productionsOf(ETHANOL).filter((p) => p.reactionId === RXN)).toHaveLength(1);
  });
});

describe('ADV-052 one product made by 25 reactions — productions part', () => {
  it('the productions index lists all 25, each with its own outcome, selectivity and role', () => {
    const template = must(demo.records.reaction['rxn_ethanol-to-ethanal-pcc']);
    const target = 'spc_ethanol';
    const { after } = commit(demo, 1, (t) => {
      for (let i = 0; i < 25; i++) {
        const id = `rxn_bulk-${String(i).padStart(2, '0')}`;
        const copy = structuredClone(template) as unknown as { id: string; outcomes: { products: { ref: unknown }[] }[] };
        copy.id = id;
        must(must(copy.outcomes[0]).products[0]).ref = { kind: 'species', id: target };
        t.reaction[id] = copy;
      }
    });
    const ix = indexEngine.build(after);
    const made = ix.productionsOf(refOf('species', target));
    const bulk = made.filter((p) => p.reactionId.startsWith('rxn_bulk-'));
    expect(bulk).toHaveLength(25);
    expect(new Set(bulk.map((p) => p.reactionId)).size).toBe(25);
    expect(bulk.every((p) => p.selectivity !== '' && p.productRole !== undefined)).toBe(true);
    expect(made.map((p) => p.reactionId)).toEqual([...made.map((p) => p.reactionId)].sort());
  });
});

describe('ADV-057 cross-chapter reaction — topics part', () => {
  it('resolves under both chapters through topic ancestry, and each mapping is listed once', () => {
    const rxn = refOf('reaction', 'rxn_benzenediazonium-to-phenol');
    const ix = indexEngine.build(demo);
    const topics = ix.topicsOf(rxn);
    expect(topics.length).toBeGreaterThanOrEqual(2);
    expect(new Set(topics).size).toBe(topics.length);
    const chapters = topics.map((topic) => must([topic, ...ix.ancestorsOf('topic', topic)].find((t) => demo.records.topic[t as never]?.topicKind === 'chapter')));
    expect(new Set(chapters).size).toBe(2);
    for (const chapter of chapters) {
      expect(ids(ix.recordsInTopic(chapter as never, { transitive: true }))).toContain(rxn.id);
    }
  });
});

describe('apply ≡ build (INV-18) — cross-record indexes', () => {
  it('scenarios: retarget a participant, change a mapping, delete and recreate, undo', () => {
    let state = demo;
    let ix = indexEngine.build(state);
    const universe = idsOf(state);
    const step = (recipe: (t: Tables) => void, cause: 'command' | 'undo' = 'command') => {
      const out = commit(state, ix.revision + 1, recipe, cause);
      for (const id of idsOf(out.after)) universe.add(id);
      ix = indexEngine.apply(ix, out.changes, out.after);
      state = out.after;
      expect(derivedSnapshot(ix, universe)).toEqual(derivedSnapshot(indexEngine.build(state, ix.revision), universe));
      expectMatchesOracle(ix, state, universe);
    };
    const rxn = 'rxn_ethanol-to-ethanal-pcc';
    step((t) => {
      must((t.reaction[rxn] as { participants: { ref: unknown }[] }).participants[0]).ref = { kind: 'species', id: 'spc_water' };
    });
    step((t) => {
      const mapping = must(Object.values(t.topic_mapping)[0]) as { target: unknown };
      mapping.target = { kind: 'reaction', id: rxn };
    });
    const removed = must(state.records.reaction[rxn]);
    step((t) => remove(t, 'reaction', rxn));
    expect(ix.participationsOf(refOf('species', 'spc_water')).some((p) => p.reactionId === rxn)).toBe(false);
    step((t) => {
      t.reaction[rxn] = removed;
    });
    step((t) => remove(t, 'entity_display', must(Object.keys(t.entity_display)[0])));
    step((t) => remove(t, 'navigator_anchor', must(Object.keys(t.navigator_anchor)[0])));
    expect(ix.revision).toBe(6);
  }, 30_000); // six edits, each compared with a rebuild and the scan oracle over every ID

  it.each([1, 2, 3, 4])('seed %i: 36 random edits, compared with a rebuild after every step and the oracle every third', (seed) => {
    let s = seed >>> 0;
    const rand = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const pick = <T,>(items: readonly T[]): T => must(items[Math.floor(rand() * items.length)]);
    let state = demo;
    let ix = indexEngine.build(state);
    const universe = idsOf(state);
    let counter = 0;
    let effective = 0;

    for (let i = 0; i < 36; i++) {
      const op = Math.floor(rand() * 9);
      const anyId = (kind: RecordRef['kind']): string =>
        pick(Object.keys(state.records[kind]).concat(`${RECORD_ID_PREFIX[kind]}_absent`));
      // The target is drawn from the kind the operation edits, so nearly every step changes something.
      const kindOf = ['reaction', 'reaction', 'reaction', 'topic_mapping', 'species', 'reaction', 'relationship', 'reagent', 'reaction'] as const;
      const kind = op <= 1 ? pick(RECORD_KINDS.filter((k) => Object.keys(state.records[k]).length > 0)) : must(kindOf[op]);
      const target = pick(Object.values(state.records[kind] as Record<string, AnyRecord>));
      const recipe = (t: Tables): void => {
        const table = t[kind] as Record<string, Record<string, unknown>>;
        const record = table[target.id];
        if (record === undefined) return;
        const reaction = record as { participants?: { ref: unknown }[]; outcomes?: { products: { ref: unknown }[] }[] };
        const prefix = RECORD_ID_PREFIX[kind];
        if (op === 0) table[`${prefix}_gen-${counter++}`] = { ...record, id: `${prefix}_gen-${counter - 1}` };
        else if (op === 1) Reflect.deleteProperty(table, target.id);
        else if (op === 2 && reaction.participants?.[0] !== undefined) reaction.participants[0].ref = { kind: 'species', id: anyId('species') };
        else if (op === 3) {
          record['topicId'] = anyId('topic');
          record['target'] = { kind: 'reaction', id: anyId('reaction') };
        } else if (op === 4) record['classIds'] = rand() < 0.3 ? [] : [anyId('class'), anyId('class')];
        else if (op === 5) {
          record['namedReactionIds'] = [anyId('named_reaction')];
          record['transformationIds'] = [anyId('transformation')];
          record['conceptIds'] = [anyId('concept')];
        } else if (op === 6) record['to'] = { kind: 'reaction', id: anyId('reaction') };
        else if (op === 7) record['families'] = rand() < 0.3 ? [] : [pick(REAGENT_FAMILIES)];
        else if (op === 8 && reaction.outcomes?.[0]?.products[0] !== undefined) reaction.outcomes[0].products[0].ref = { kind: 'species', id: anyId('species') };
      };
      const out = commit(state, ix.revision + 1, recipe);
      if (out.changes.created.length + out.changes.updated.length + out.changes.deleted.length > 0) effective += 1;
      for (const id of idsOf(out.after)) universe.add(id);
      ix = indexEngine.apply(ix, out.changes, out.after);
      state = out.after;
      expect(derivedSnapshot(ix, universe)).toEqual(derivedSnapshot(indexEngine.build(state, ix.revision), universe));
      if (i % 3 === 2) expectMatchesOracle(ix, state, universe);
    }
    expect(effective).toBeGreaterThan(30);
  }, 60_000); // 36 edits with a full rebuild compared after each; ~4 s alone, far more when suites run in parallel
});

describe('handles', () => {
  const victim = must(Object.values(maximal.records.species)[0]);
  const edit = (revision: number, cause: 'command' | 'replace' = 'command') =>
    commit(maximal, revision, (t) => remove(t, 'species', victim.id), cause);

  it('a stale handle throws on every family of query instead of answering from moved-on data', () => {
    const ix = indexEngine.build(maximal);
    const { after, changes } = edit(1);
    const next = indexEngine.apply(ix, changes, after);
    expect(next.revision).toBe(1);
    const spc = refOf('species', 'spc_x');
    expect(() => ix.participationsOf(spc)).toThrow(/Stale/);
    expect(() => ix.reactionsByConcept('cpt_x' as never, { includeDescendants: true })).toThrow(/Stale/);
    expect(() => ix.anchors()).toThrow(/Stale/);
    expect(() => ix.referrersOf('spc_x')).toThrow(/Stale/);
    expect(() => indexEngine.apply(ix, changes, after)).toThrow(/Stale/);
  });

  it('a replace ChangeSet or a revision gap rebuilds and leaves the previous handle usable', () => {
    const ix = indexEngine.build(maximal);
    for (const [revision, cause] of [[1, 'replace'], [5, 'command']] as const) {
      const { after, changes } = edit(revision, cause);
      const next = indexEngine.apply(ix, changes, after);
      expect(next.revision).toBe(revision);
      expect(next.get(victim.id)).toBeUndefined();
      expectMatchesOracle(next, after, idsOf(after));
      expect(ix.get(victim.id)).toBe(victim);
    }
  });

  it('arrays handed out earlier stay valid snapshots after later applies', () => {
    const ix = indexEngine.build(demo);
    const held = ix.participationsOf(refOf('species', 'spc_ethanol'));
    const copy = [...held];
    const { after, changes } = commit(demo, 1, (t) => remove(t, 'reaction', 'rxn_ethanol-to-ethanal-pcc'));
    const next = indexEngine.apply(ix, changes, after);
    expect(held).toEqual(copy);
    expect(next.participationsOf(refOf('species', 'spc_ethanol')).length).toBe(copy.length - 1);
  });

  it('rejects a ChangeSet naming a record the next state lacks, and foreign handles', () => {
    const ix = indexEngine.build(maximal);
    const { changes } = commit(maximal, 1, (t) => {
      t.species['spc_ghost'] = { ...victim, id: 'spc_ghost' };
    });
    expect(() => indexEngine.apply(ix, changes, maximal)).toThrow(/spc_ghost/);
    expect(ix.revision).toBe(0); // the failed apply left the handle usable
    expect(() => ix.anchors()).not.toThrow();
    expect(() => indexEngine.apply({ revision: 0 } as unknown as ReadonlyIndexes, changes, maximal)).toThrow(TypeError);
  });
});
