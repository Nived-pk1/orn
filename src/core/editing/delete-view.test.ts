/**
 * The delete impact in words for the dialog (step 6.8a, D1): computed from the reference registry's delete policies BEFORE anything changes
 * ("Removed from" = detach, "Deleted with it" = cascade, "Blocks the delete" = restrict), the number of rich-text [[links]] left behind, and
 * the delete as ONE envelope that undoes in one step. Over the maximal fixture (its records and paths are the registry's own).
 */
import { describe, expect, it } from 'vitest';
import type { Concept } from '../schema';
import { makeStore, mustCommit, recordIn, ref } from '../../test-support/command-kit';
import { loadFixtureState } from '../../test-support/state-fixture';
import { coreIndexEngine } from '../indexes/engine';
import { deleteEnvelope, deleteView } from './delete-view';

const state = loadFixtureState('maximal-valid');
const indexes = coreIndexEngine.build(state);

const PROPANONE = ref('species', 'spc_max-propanone');
const GRIGNARD = ref('reaction', 'rxn_max-grignard-propanone');

describe('deleteView', () => {
  it('a species used by a reaction is BLOCKED: each blocker by name with the field in words, and the delete is unavailable', () => {
    const view = deleteView(state, indexes, [PROPANONE]);
    expect(view.canDelete).toBe(false);
    expect(view.blocks.map((row) => row.ref)).toContainEqual(GRIGNARD);
    const row = view.blocks.find((one) => one.ref.id === GRIGNARD.id);
    expect(row?.name).not.toBe('');
    expect(row?.fields.length).toBeGreaterThan(0);
    for (const field of row?.fields ?? []) expect(field).not.toMatch(/[[\]._]/); // words, not a path
  });

  it('a reaction cascades its schemes and mappings ("Deleted with it") and is blocked by the route that uses it', () => {
    const view = deleteView(state, indexes, [GRIGNARD]);
    expect(view.deletedWith.map((row) => row.ref.kind)).toEqual(expect.arrayContaining(['reaction_scheme', 'topic_mapping', 'exam_relevance']));
    expect(view.blocks.map((row) => row.ref.kind)).toContain('route');
  });

  it('detaches ("Removed from") list each surviving record once with its fields in words, by name', () => {
    const view = deleteView(state, indexes, [ref('concept', 'cpt_max-carbonyl-addition')]);
    expect(view.canDelete).toBe(true);
    const owners = view.removedFrom.map((row) => `${row.ref.kind}:${row.ref.id}`);
    expect(owners.length).toBeGreaterThan(1);
    expect(new Set(owners).size).toBe(owners.length);
    for (const row of view.removedFrom) {
      expect(row.fields.length).toBeGreaterThan(0);
      expect(row.name).not.toBe('');
    }
  });

  it('a reaction with only a relationship cascade can be deleted and lists the relationship under "Deleted with it"', () => {
    const view = deleteView(state, indexes, [ref('reaction', 'rxn_max-isobutene-hydration')]);
    expect(view.canDelete).toBe(true);
    expect(view.deletedWith.map((row) => row.ref.kind)).toContain('relationship');
  });

  it('a record nothing points at has nothing to list and can be deleted', () => {
    const view = deleteView(state, indexes, [ref('view_preset', 'vpr_max-carbonyl')]);
    expect(view).toMatchObject({ canDelete: true, removedFrom: [], deletedWith: [], blocks: [], softLinks: 0 });
    expect(view.targets).toHaveLength(1);
  });

  it('counts the rich-text [[links]] to the deleted record that are left as they are', () => {
    const linked = recordIn(state, 'species', PROPANONE.id);
    const withLink = { ...state, records: { ...state.records, species: { ...state.records.species, [PROPANONE.id]: { ...linked, notes: 'See [[spc_max-diethyl-ether]] and [[spc_max-diethyl-ether|again]].' } } } };
    const view = deleteView(withLink as typeof state, coreIndexEngine.build(withLink as typeof state), [ref('species', 'spc_max-diethyl-ether')]);
    expect(view.softLinks).toBe(2);
  });
});

describe('deleteEnvelope', () => {
  it('is ONE envelope labelled "delete <name>"; it applies, and ONE undo restores every changed record', () => {
    const store = makeStore();
    const target = ref('concept', 'cpt_max-carbonyl-addition');
    const before = store.getState();
    const built = deleteEnvelope(before, [target]);
    expect(built.label).toBe(`delete ${recordIn<Concept>(before, 'concept', target.id).name}`);
    mustCommit(store.dispatch(built));
    expect(Object.hasOwn(store.getState().records.concept, target.id)).toBe(false);
    expect(store.historyLabels().undo[0]).toBe(built.label);
    mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'nothing to undo' } });
    expect(store.getState().records).toEqual(before.records);
  });

  it('a blocked delete is refused by the store as a value and nothing changes', () => {
    const store = makeStore();
    const before = store.getState();
    const result = store.dispatch(deleteEnvelope(before, [PROPANONE]));
    expect(result.ok).toBe(false);
    expect(store.getState()).toBe(before);
  });
});
