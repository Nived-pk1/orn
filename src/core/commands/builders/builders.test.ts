/** Builders: duplicate (ADV-020), merge (ADV-021), reorder; rename keeps references (ADV-019). */
import { describe, expect, it } from 'vitest';
import { referenceEngine } from '../../references';
import type { AnyRecord } from '../../schema';
import { envelope, makeStore, mustCommit, recordIn, ref, testContext, withFields } from '../../../test-support/command-kit';
import { duplicateRecord, mergeRecords, reorderItems } from '.';
import type { BuildResult } from './types';

const RXN = ref('reaction', 'rxn_max-grignard-propanone');
const PROPANONE = ref('species', 'spc_max-propanone');

function envelopeOf(result: BuildResult) {
  if (!result.ok) throw new Error(`builder failed: ${result.error.message}`);
  return result.envelope;
}

describe('duplicateRecord', () => {
  it('ADV-020: regenerates every nested ID, keeps them unique, keeps references to other records, resets provenance', () => {
    const store = makeStore();
    const source = recordIn(store.getState(), 'reaction', RXN.id);
    const built = envelopeOf(duplicateRecord(store.getState(), RXN, testContext(3), { label: 'Copy reaction' }));
    const result = mustCommit(store.dispatch(built));
    const created = result.changes.created;
    expect(created).toHaveLength(1);
    const copy = recordIn(store.getState(), 'reaction', created[0]?.id ?? '');
    expect(copy.id).not.toBe(source.id);

    const sourceIds = new Set([source.id, ...referenceEngine.nestedIds(source).map((n) => n.id)]);
    const copyIds = [copy.id, ...referenceEngine.nestedIds(copy).map((n) => n.id)];
    expect(copyIds).toHaveLength(sourceIds.size);
    expect(new Set(copyIds).size).toBe(copyIds.length);
    expect(copyIds.some((id) => sourceIds.has(id))).toBe(false);
    expect(copyIds.every((id) => id.startsWith(id.slice(0, 3) + '_'))).toBe(true);

    // references to other records and the record's own parts still resolve
    const external = (r: AnyRecord) => referenceEngine.extract(r).filter((x) => x.spec.target.type === 'id' || x.spec.target.type === 'ref').map((x) => x.targetId).sort();
    expect(external(copy)).toEqual(external(source));
    expect(store.findings.all({ severity: 'error' })).toEqual([]);
    expect(store.findings.bySubject(created[0] ?? RXN).every((f) => f.severity !== 'error')).toBe(true);

    expect(copy.provenance).toMatchObject({ origin: 'user', createdAt: '2026-09-21T14:13:20.000Z', updatedAt: '2026-09-21T14:13:20.000Z' });
    expect(copy.provenance.importBatchId).toBeUndefined();
    expect(copy.provenance.legacy).toBeUndefined();
    expect(result.changes.label).toBe('Copy reaction');
    expect(store.peekHistory().undo?.selectionHint).toEqual(created);
  });

  it('a verified review does not carry over; other review states do; presentation records copy without review', () => {
    const store = makeStore();
    const ctx = testContext(5);
    const verified = withFields(recordIn(store.getState(), 'species', PROPANONE.id), {
      review: { lifecycle: 'published', status: 'verified', confidence: 'high', reasons: [], reviewedAt: '2026-09-21T00:00:00.000Z' },
    });
    mustCommit(store.dispatch(envelope('Verify', { type: 'record.update', record: verified })));
    const copyOfVerified = mustCommit(store.dispatch(envelopeOf(duplicateRecord(store.getState(), PROPANONE, ctx))));
    const c1 = recordIn(store.getState(), 'species', copyOfVerified.changes.created[0]?.id ?? '') as unknown as { review: Record<string, unknown> };
    expect(c1.review).toEqual({ lifecycle: 'published', status: 'unreviewed', reasons: [] });

    const display = ref('entity_display', 'edp_max-diethyl-ether');
    const built = duplicateRecord(store.getState(), display, ctx);
    expect(built.ok).toBe(true);
    if (built.ok) {
      const record = (built.envelope.commands[0] as { record: AnyRecord }).record;
      expect('review' in record).toBe(false);
      expect(record.provenance.origin).toBe('user');
    }
  });

  it('is deterministic for the same context seed, and NOT_FOUND for a missing record', () => {
    const state = makeStore().getState();
    const a = envelopeOf(duplicateRecord(state, RXN, testContext(11)));
    const b = envelopeOf(duplicateRecord(state, RXN, testContext(11)));
    expect(a).toEqual(b);
    const missing = duplicateRecord(state, ref('reaction', 'rxn_nope'), testContext());
    expect(missing.ok ? 'ok' : missing.error.code).toBe('NOT_FOUND');
  });

  it('duplicating twice gives two records that coexist (all IDs globally unique, INV-01)', () => {
    const store = makeStore();
    const ctx = testContext(2);
    mustCommit(store.dispatch(envelopeOf(duplicateRecord(store.getState(), RXN, ctx))));
    mustCommit(store.dispatch(envelopeOf(duplicateRecord(store.getState(), RXN, ctx))));
    expect(Object.keys(store.getState().records.reaction)).toHaveLength(6);
    expect(store.findings.all({ severity: 'error' })).toEqual([]);
  });
});

describe('mergeRecords', () => {
  function storeWithDuplicateSpecies() {
    const store = makeStore();
    const built = envelopeOf(duplicateRecord(store.getState(), PROPANONE, testContext(9)));
    const created = mustCommit(store.dispatch(built)).changes.created[0];
    if (created === undefined) throw new Error('no copy');
    return { store, twin: created };
  }

  it('ADV-021: re-points every reference and deletes the source in one undoable batch', () => {
    const { store, twin } = storeWithDuplicateSpecies();
    // point a reaction participant at the twin, then merge the twin back into the original
    const rxn = recordIn(store.getState(), 'reaction', 'rxn_max-isobutene-hydration') as unknown as { participants: { ref: { kind: string; id: string } }[] };
    const participants = rxn.participants.map((p, i) => (i === 0 ? { ...p, ref: { kind: 'species', id: twin.id } } : p));
    mustCommit(store.dispatch(envelope('Use twin', { type: 'record.update', record: withFields(rxn as unknown as AnyRecord, { participants }) })));
    expect(store.getIndexes().referrersOf(twin.id).length).toBeGreaterThan(0);
    const before = store.getState();

    const result = mustCommit(store.dispatch(envelopeOf(mergeRecords(store.getState(), twin, PROPANONE))));
    expect(result.changes.deleted).toEqual([twin]);
    expect(result.changes.updated.map((r) => r.id)).toContain('rxn_max-isobutene-hydration');
    expect(store.getIndexes().referrersOf(twin.id)).toEqual([]);
    expect(store.getIndexes().referrersOf(PROPANONE.id).some((r) => r.owner.id === 'rxn_max-isobutene-hydration')).toBe(true);
    expect(store.findings.all({ severity: 'error' })).toEqual([]);

    expect(store.historyLabels().undo[0]).toContain('Merge species');
    mustCommit(store.undo() ?? { ok: false, error: { code: 'INTERNAL', message: 'null' } });
    expect(store.getState()).toEqual(before);
  });

  it('accepts the caller\'s merged target record and rejects one for another record', () => {
    const { store, twin } = storeWithDuplicateSpecies();
    const target = recordIn(store.getState(), 'species', PROPANONE.id);
    const merged = withFields(target, { notes: 'Merged notes.' });
    mustCommit(store.dispatch(envelopeOf(mergeRecords(store.getState(), twin, PROPANONE, { mergedRecord: merged }))));
    expect(recordIn(store.getState(), 'species', PROPANONE.id)).toEqual(merged);
    const wrong = mergeRecords(store.getState(), ref('species', 'spc_max-water'), PROPANONE, { mergedRecord: withFields(target, { id: 'spc_max-water' }) });
    expect(wrong.ok).toBe(false);
  });

  it('fails visibly (and changes nothing) when something could not be moved', () => {
    const store = makeStore();
    // a participant's profileId is a nested reference into the reagent: it cannot follow the merge
    const from = ref('reagent', 'rgt_max-methylmagnesium-bromide');
    const to = ref('reagent', 'rgt_max-phosphoric-acid');
    const before = store.getState();
    const result = store.dispatch(envelopeOf(mergeRecords(store.getState(), from, to)));
    expect(result.ok).toBe(false);
    expect(store.getState()).toBe(before);
  });

  it('rejects different kinds, the same record and missing records as values', () => {
    const state = makeStore().getState();
    const code = (r: BuildResult) => (r.ok ? 'ok' : r.error.code);
    expect(code(mergeRecords(state, PROPANONE, ref('class', 'cls_max-alcohols')))).toBe('VALIDATION_FAILED');
    expect(code(mergeRecords(state, PROPANONE, PROPANONE))).toBe('VALIDATION_FAILED');
    expect(code(mergeRecords(state, ref('species', 'spc_nope'), PROPANONE))).toBe('NOT_FOUND');
  });
});

describe('reorderItems', () => {
  it('reorders participants as a permutation and the result validates', () => {
    const store = makeStore();
    const rxn = recordIn(store.getState(), 'reaction', RXN.id) as unknown as { participants: { id: string }[] };
    const ids = rxn.participants.map((p) => p.id);
    const reversed = [...ids].reverse();
    mustCommit(store.dispatch(envelopeOf(reorderItems(store.getState(), { ref: RXN, field: 'participants', orderedIds: reversed }))));
    const after = recordIn(store.getState(), 'reaction', RXN.id) as unknown as { participants: { id: string }[] };
    expect(after.participants.map((p) => p.id)).toEqual(reversed);
    expect(store.historyLabels().undo).toEqual(['Reorder participants']);
    store.undo();
    expect((recordIn(store.getState(), 'reaction', RXN.id) as unknown as { participants: { id: string }[] }).participants.map((p) => p.id)).toEqual(ids);
  });

  it('reorders items nested inside another item (`within`) and arrays of plain ID strings', () => {
    const store = makeStore();
    const species = recordIn(store.getState(), 'species', 'spc_max-2-methylpropan-2-ol') as unknown as { classIds: string[] };
    const rxn = recordIn(store.getState(), 'reaction', RXN.id) as unknown as { outcomes: { id: string; products: { id: string }[] }[] };
    const outcome = rxn.outcomes[0];
    if (outcome === undefined) throw new Error('fixture has no outcome');
    const reversed = outcome.products.map((p) => p.id).reverse();
    const built = reorderItems(store.getState(), { ref: RXN, field: 'products', within: { field: 'outcomes', id: outcome.id }, orderedIds: reversed });
    mustCommit(store.dispatch(envelopeOf(built)));
    const after = recordIn(store.getState(), 'reaction', RXN.id) as unknown as typeof rxn;
    expect(after.outcomes.find((o) => o.id === outcome.id)?.products.map((p) => p.id)).toEqual(reversed);
    expect(species.classIds.length).toBeGreaterThan(0);
    const classes = [...species.classIds].reverse();
    const strings = reorderItems(store.getState(), { ref: ref('species', 'spc_max-2-methylpropan-2-ol'), field: 'classIds', orderedIds: classes });
    expect(strings.ok).toBe(true);
  });

  it('rejects anything that is not a permutation, unknown fields and missing records, as values', () => {
    const state = makeStore().getState();
    const rxn = recordIn(state, 'reaction', RXN.id) as unknown as { participants: { id: string }[] };
    const ids = rxn.participants.map((p) => p.id);
    const code = (r: BuildResult) => (r.ok ? 'ok' : r.error.code);
    expect(code(reorderItems(state, { ref: RXN, field: 'participants', orderedIds: ids.slice(1) }))).toBe('VALIDATION_FAILED');
    expect(code(reorderItems(state, { ref: RXN, field: 'participants', orderedIds: [...ids.slice(1), ids[1] ?? ''] }))).toBe('VALIDATION_FAILED');
    expect(code(reorderItems(state, { ref: RXN, field: 'participants', orderedIds: [...ids.slice(1), 'prt_unknown'] }))).toBe('VALIDATION_FAILED');
    expect(code(reorderItems(state, { ref: RXN, field: 'nonsense', orderedIds: [] }))).toBe('VALIDATION_FAILED');
    expect(code(reorderItems(state, { ref: RXN, field: 'products', within: { field: 'outcomes', id: 'out_nope' }, orderedIds: [] }))).toBe('VALIDATION_FAILED');
    expect(code(reorderItems(state, { ref: ref('reaction', 'rxn_nope'), field: 'participants', orderedIds: ids }))).toBe('NOT_FOUND');
  });

  it('an unchanged order builds an envelope the store reports as EMPTY_COMMAND', () => {
    const store = makeStore();
    const rxn = recordIn(store.getState(), 'reaction', RXN.id) as unknown as { participants: { id: string }[] };
    const same = envelopeOf(reorderItems(store.getState(), { ref: RXN, field: 'participants', orderedIds: rxn.participants.map((p) => p.id) }));
    const result = store.dispatch(same);
    expect(result.ok ? 'ok' : result.error.code).toBe('EMPTY_COMMAND');
  });
});

describe('ADV-019: rename a species', () => {
  it('changes names, not IDs: every reference and every referrer is unchanged, the name index follows', () => {
    const store = makeStore();
    const before = store.getIndexes().referrersOf(PROPANONE.id);
    const species = recordIn(store.getState(), 'species', PROPANONE.id) as unknown as { names: Record<string, unknown> };
    const renamed = withFields(species as unknown as AnyRecord, { names: { ...species.names, canonical: 'Acetone (renamed)' } });
    mustCommit(store.dispatch(envelope('Rename', { type: 'record.update', record: renamed })));
    expect(store.getIndexes().referrersOf(PROPANONE.id)).toEqual(before);
    expect(store.getIndexes().byFoldedName('species', 'acetone (renamed)')).toEqual([PROPANONE]);
    expect(store.getIndexes().byFoldedName('species', 'propanone')).toEqual([]);
  });
});
