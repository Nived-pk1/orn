/**
 * Which documents a change reaches (step 4.5, fanout.ts), on real ChangeSets from the store: an ordinary edit reaches only its own
 * record; a mapping, a reagent's families, a prerequisite, an exam version's coverage and the topic tree reach exactly the
 * documents that read them; `replace` and `remote` ask for a full load. The incremental = rebuild property
 * (tests/property/search-incremental.test.ts) is the safety net for anything missed here.
 */
import { describe, expect, it } from 'vitest';
import type { ChangeSet } from '@/core/dataset/contracts';
import { indexEngine } from '@/core/indexes/full';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { makeStore } from '@/test-support/command-kit';
import { searchStateOf } from '@/test-support/search-state';
import { affectedBy, allRefs, keyOf } from './fanout';

const PARAMS = { species: 12, classes: 3, reagents: 2, reactions: 10, relationshipsPerReaction: 0, topics: 3, shape: 'dense', seed: 6 } as const;
type Loose = Record<string, unknown>;
type Edit = AnyRecord | { readonly delete: { readonly kind: string; readonly id: string } };

function change(edit: (state: CanonicalState) => Edit) {
  const store = makeStore(searchStateOf(PARAMS));
  const seen: ChangeSet[] = [];
  store.subscribe((changes) => seen.push(changes));
  const e = edit(store.getState());
  const result =
    'delete' in e
      ? store.dispatch({ label: 'x', commands: [{ type: 'record.delete', ref: e.delete as never, mode: 'restrict' }] })
      : store.dispatch({ label: 'x', commands: [{ type: 'record.update', record: e }] });
  expect(result.ok, JSON.stringify(result.ok ? '' : result.error)).toBe(true);
  const changes = seen[0] as ChangeSet;
  const state = store.getState();
  return { changes, state, affected: affectedBy(changes, state, indexEngine.build(state, store.getRevision())) };
}

const table = (state: CanonicalState, kind: string): Record<string, Loose> => (state.records as unknown as Record<string, Record<string, Loose>>)[kind] ?? {};
const at = (state: CanonicalState, kind: string, id: string): Loose => table(state, kind)[id] as Loose;
const first = (state: CanonicalState, kind: string): string => Object.keys(table(state, kind)).sort()[0] as string;
const keys = (refs: readonly { kind: string; id: string }[]): string[] => refs.map((ref) => keyOf(ref as never));
const as = (value: unknown): AnyRecord => value as AnyRecord;

describe('what a change reaches', () => {
  it('a rename, an alias, a note: only the record itself', () => {
    const { affected } = change((s) => as({ ...at(s, 'species', first(s, 'species')), names: { canonical: 'Other', common: [], aliases: ['x'] }, notes: 'n' }));
    expect(affected.direct).toHaveLength(1);
    expect(affected.behind).toEqual([]);
    expect(affected.reload).toBe(false);
  });

  it('a mapping edit has no document of its own but reaches its target', () => {
    const { affected } = change((s) => as({ ...at(s, 'topic_mapping', first(s, 'topic_mapping')), note: 'just a note' }));
    expect(affected.direct).toEqual([]);
    expect(keys(affected.behind).filter((k) => k.startsWith('reaction:'))).toHaveLength(1);
  });

  it('a mapping that moves from one record to another reaches both, and every concept', () => {
    const before = searchStateOf(PARAMS);
    const id = first(before, 'topic_mapping');
    const oldTarget = (at(before, 'topic_mapping', id).target as { id: string }).id;
    const species = first(before, 'species');
    const { affected, state } = change((s) => as({ ...at(s, 'topic_mapping', id), target: { kind: 'species', id: species } }));
    expect(keys(affected.behind)).toContain(`species:${species}`);
    expect(keys(affected.behind)).toContain(`reaction:${oldTarget}`);
    for (const conceptId of Object.keys(state.records.concept)) expect(keys(affected.behind)).toContain(`concept:${conceptId}`);
    expect(keys(affected.behind).every((k) => /^(species|reaction|concept):/.test(k))).toBe(true);
  });

  it('a deleted mapping reaches its old target (read from the inverse patches)', () => {
    const before = searchStateOf(PARAMS);
    const id = first(before, 'topic_mapping');
    const target = (at(before, 'topic_mapping', id).target as { id: string }).id;
    const { affected } = change(() => ({ delete: { kind: 'topic_mapping', id } }));
    expect(keys(affected.behind)).toContain(`reaction:${target}`);
  });

  it('a reagent\'s families reach the reactions that use it; its name does not', () => {
    const renamed = change((s) => as({ ...at(s, 'reagent', first(s, 'reagent')), names: { canonical: 'Renamed reagent', common: [], aliases: [] } }));
    expect(renamed.affected.behind).toEqual([]);
    const families = change((s) => as({ ...at(s, 'reagent', first(s, 'reagent')), families: ['acid'] }));
    const reagent = first(families.state, 'reagent');
    const users = Object.values(families.state.records.reaction)
      .filter((r) => r.participants.some((p) => p.ref.id === reagent))
      .map((r) => `reaction:${r.id}`)
      .sort();
    expect(users.length).toBeGreaterThan(0);
    expect(keys(families.affected.behind)).toEqual(users);
  });

  it('prerequisite fields reach every concept; other reaction fields do not', () => {
    const note = change((s) => as({ ...at(s, 'reaction', first(s, 'reaction')), notes: 'x' }));
    expect(note.affected.behind).toEqual([]);
    const prereq = change((s) => as({ ...at(s, 'reaction', first(s, 'reaction')), prerequisiteConceptIds: ['cpt_s-resonance'] }));
    expect(keys(prereq.affected.behind)).toEqual(Object.keys(prereq.state.records.concept).sort().map((id) => `concept:${id}`));
  });

  it('an exam version\'s units reach every document; its label does not', () => {
    const label = change((s) => as({ ...at(s, 'exam_version', 'exv_s-2025'), label: 'renamed' }));
    expect(label.affected.behind).toEqual([]);
    const units = change((s) => as({ ...at(s, 'exam_version', 'exv_s-2025'), units: [] }));
    const direct = new Set(keys(units.affected.direct));
    expect(keys(units.affected.behind)).toEqual(keys(allRefs(units.state)).filter((k) => !direct.has(k)));
  });

  it('a topic\'s parent reaches every document; its name does not', () => {
    const named = change((s) => as({ ...at(s, 'topic', first(s, 'topic')), name: 'Renamed topic' }));
    expect(named.affected.behind).toEqual([]);
    const reparent = change((s) => {
      const chapter = Object.keys(table(s, 'topic')).sort().find((id) => at(s, 'topic', id).parentId !== undefined) as string;
      const { parentId, ...rest } = at(s, 'topic', chapter);
      void parentId;
      return as(rest);
    });
    expect(reparent.affected.behind.length).toBeGreaterThan(20);
  });

  it('replace and remote changes ask for a full load, and nothing else', () => {
    const { changes, state } = change((s) => as({ ...at(s, 'species', first(s, 'species')), notes: 'x' }));
    const indexes = indexEngine.build(state, 1);
    for (const cause of ['replace', 'remote'] as const) {
      expect(affectedBy({ ...changes, cause }, state, indexes)).toEqual({ direct: [], behind: [], reload: true });
    }
  });

  it('the result is sorted, without duplicates, and nothing is both direct and behind', () => {
    const { affected } = change((s) => as({ ...at(s, 'exam_version', 'exv_s-2025'), units: [] }));
    const all = [...keys(affected.direct), ...keys(affected.behind)];
    expect(new Set(all).size).toBe(all.length);
    expect(keys(affected.behind)).toEqual([...keys(affected.behind)].sort());
  });
});
