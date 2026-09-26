/**
 * Delete impact (ADV-017, ADV-018): restrict blockers, cascade closure, detaches, nested-ID references,
 * and the delete commands built on it.
 */
import { describe, expect, it } from 'vitest';
import { duplicateRecord } from './builders';
import { envelope, makeStore, mustCommit, recordIn, ref, testContext } from '../../test-support/command-kit';
import { loadFixtureState } from '../../test-support/state-fixture';
import { coreIndexEngine } from '../indexes/engine';
import { computeDeleteImpact } from './impact';

const PROPANONE = ref('species', 'spc_max-propanone');
const GRIGNARD_RXN = ref('reaction', 'rxn_max-grignard-propanone');
const ROUTE = ref('route', 'rte_max-propanone-to-isobutene');

describe('computeDeleteImpact', () => {
  const state = loadFixtureState('maximal-valid');
  const indexes = coreIndexEngine.build(state);

  it('lists restrict referrers of a species, sorted, with the path of each reference', () => {
    const impact = computeDeleteImpact(state, indexes, [PROPANONE]);
    expect(impact.targets).toEqual([PROPANONE]);
    expect(impact.blockedBy.length).toBeGreaterThan(0);
    expect(impact.blockedBy.every((referrer) => referrer.onDelete === 'restrict')).toBe(true);
    expect(impact.blockedBy.map((r) => r.owner.id)).toContain(GRIGNARD_RXN.id);
    const sorted = [...impact.blockedBy].sort((a, b) => a.owner.id.localeCompare(b.owner.id) || a.path.localeCompare(b.path));
    expect(impact.blockedBy.map((r) => `${r.owner.id}${r.path}`)).toEqual(sorted.map((r) => `${r.owner.id}${r.path}`));
  });

  it('a reaction is blocked by the route (restrict, through the reaction and nested outcome IDs) and cascades the rest', () => {
    const impact = computeDeleteImpact(state, indexes, [GRIGNARD_RXN]);
    expect(impact.blockedBy.map((r) => r.owner)).toEqual(expect.arrayContaining([ROUTE]));
    expect(impact.blockedBy.some((r) => r.path.startsWith('steps[') && r.path.endsWith('outcomeId'))).toBe(true);
    const cascaded = impact.cascades.map((c) => c.kind);
    expect(cascaded).toEqual(expect.arrayContaining(['reaction_scheme', 'topic_mapping', 'exam_relevance']));
  });

  it('owners deleted by the same query do not block: deleting reaction and route together leaves no blockers', () => {
    const impact = computeDeleteImpact(state, indexes, [GRIGNARD_RXN, ROUTE]);
    expect(impact.blockedBy).toEqual([]);
    expect(impact.targets).toEqual([GRIGNARD_RXN, ROUTE]);
  });

  it('is transitive: a cascade owner that is itself referenced by a restrict reference blocks', () => {
    const exam = ref('exam', 'exm_max-jee-advanced');
    const impact = computeDeleteImpact(state, indexes, [exam]);
    expect(impact.blockedBy.some((r) => r.owner.kind === 'exam_version')).toBe(true);
    expect(impact.cascades.some((c) => c.kind === 'exam_relevance')).toBe(true);
  });

  it('ignores missing targets but still reports them, and lists nothing twice', () => {
    const missing = ref('species', 'spc_does-not-exist');
    const impact = computeDeleteImpact(state, indexes, [missing, missing, PROPANONE]);
    expect(impact.targets).toEqual([missing, PROPANONE]);
    expect(impact.blockedBy).toEqual(computeDeleteImpact(state, indexes, [PROPANONE]).blockedBy);
  });

  it('a record with no referrers has an empty impact', () => {
    const impact = computeDeleteImpact(state, indexes, [ref('view_preset', 'vpr_max-carbonyl')]);
    expect(impact.blockedBy).toEqual([]);
    expect(impact.cascades).toEqual([]);
    expect(impact.detaches).toEqual([]);
  });
});

describe('delete commands', () => {
  it('ADV-017: a species used by 30 reactions is blocked in both modes, with the full impact list', () => {
    const store = makeStore();
    const ctx = testContext(7);
    for (let i = 0; i < 30; i += 1) {
      const built = duplicateRecord(store.getState(), GRIGNARD_RXN, ctx);
      if (!built.ok) throw new Error('duplicate failed');
      mustCommit(store.dispatch(built.envelope), 'duplicate');
    }
    const impact = store.deleteImpact([PROPANONE]);
    expect(new Set(impact.blockedBy.map((r) => r.owner.id)).size).toBeGreaterThanOrEqual(31);
    const before = store.getState();
    for (const mode of ['restrict', 'apply_cascade'] as const) {
      const result = store.dispatch(envelope('Delete propanone', { type: 'record.delete', ref: PROPANONE, mode }));
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('DELETE_RESTRICTED');
      expect(result.error.impact?.blockedBy.length).toBe(impact.blockedBy.length);
    }
    expect(store.getState()).toBe(before);
    expect(store.getRevision()).toBe(30);
  });

  it('ADV-018: the route blocks the reaction; once the route is gone the scheme, mapping and relevance cascade', () => {
    const store = makeStore();
    const blocked = store.dispatch(envelope('Delete reaction', { type: 'record.delete', ref: GRIGNARD_RXN, mode: 'apply_cascade' }));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.impact?.blockedBy.some((r) => r.owner.id === ROUTE.id)).toBe(true);

    mustCommit(store.dispatch(envelope('Delete route', { type: 'record.delete', ref: ROUTE, mode: 'restrict' })));
    const restrictOnly = store.dispatch(envelope('Delete reaction', { type: 'record.delete', ref: GRIGNARD_RXN, mode: 'restrict' }));
    expect(restrictOnly.ok).toBe(false);
    if (!restrictOnly.ok) expect(restrictOnly.error.code).toBe('DELETE_RESTRICTED');

    const result = mustCommit(store.dispatch(envelope('Delete reaction', { type: 'record.delete', ref: GRIGNARD_RXN, mode: 'apply_cascade' })));
    const gone = new Set(result.changes.deleted.map((r) => r.kind));
    expect(gone).toEqual(new Set(['reaction', 'reaction_scheme', 'topic_mapping', 'exam_relevance']));
    expect(store.findings.all({ severity: 'error' })).toEqual([]);
  });

  it('detach removes the reference from the survivor (a concept used as a tag-like link)', () => {
    const store = makeStore();
    const concept = ref('concept', 'cpt_max-carbocation-stability');
    const impact = store.deleteImpact([concept]);
    expect(impact.blockedBy).toEqual([]);
    expect(impact.detaches.length).toBeGreaterThan(0);
    const before = store.getState();
    const result = mustCommit(store.dispatch(envelope('Delete concept', { type: 'record.delete', ref: concept, mode: 'apply_cascade' })));
    expect(result.changes.deleted).toEqual([concept]);
    expect(result.changes.updated.length).toBeGreaterThan(0);
    expect(store.getIndexes().referrersOf(concept.id)).toEqual([]);
    for (const owner of result.changes.updated) {
      expect(JSON.stringify(recordIn(store.getState(), owner.kind, owner.id))).not.toContain(concept.id);
      expect(JSON.stringify(recordIn(before, owner.kind, owner.id))).toContain(concept.id);
    }
    expect(store.findings.all({ severity: 'error' })).toEqual([]);
  });

  it('restrict refuses a delete that would need cascades or detaches, and names them', () => {
    const store = makeStore();
    const concept = ref('concept', 'cpt_max-carbocation-stability');
    const result = store.dispatch(envelope('Delete concept', { type: 'record.delete', ref: concept, mode: 'restrict' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DELETE_RESTRICTED');
      expect(result.error.impact?.detaches.length).toBeGreaterThan(0);
    }
  });

  it('a missing record is NOT_FOUND', () => {
    const result = makeStore().dispatch(envelope('x', { type: 'record.delete', ref: ref('species', 'spc_nope'), mode: 'restrict' }));
    expect(result.ok ? undefined : result.error.code).toBe('NOT_FOUND');
  });
});
