/**
 * Import apply (step 3.7): INV-21 (atomic after a snapshot; every refusal changes nothing), ADV-045 import part (history
 * cleared, redo unavailable), the staleness / unknown-batch / plan-mismatch refusals (Q12), batch report and quarantine rows.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { envelope, makeStore, mustCommit } from '@/test-support/command-kit';
import { fakePorts, parsedFrom, testSession } from '@/test-support/import-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { ImportPlan } from './contracts';

const base = loadFixtureState('maximal-valid');
const empty: CanonicalState = { meta: base.meta, records: emptyRecordTables() };
const anySpeciesId = Object.keys(base.records.species)[0] as string;
const renamed = (state: CanonicalState, id: string, name: string): CanonicalState =>
  produce(state, (draft) => {
    (draft.records.species[id] as unknown as { names: { canonical: string } }).names.canonical = name;
  });

function planOf(outcome: Awaited<ReturnType<ReturnType<typeof testSession>['session']['preview']>>): ImportPlan {
  if (!outcome.ok) throw new Error(`preview refused: ${outcome.code} ${outcome.message}`);
  return outcome.plan;
}

describe('apply (INV-21 atomic after a snapshot; ADV-045 import part)', () => {
  it('pre_import snapshot of the live state FIRST, then ONE replaceState, history cleared, report stored; the applied state IS the previewed merged replica', async () => {
    const store = makeStore(base);
    // Give the store an undo history that the import must clear.
    mustCommit(store.dispatch(envelope('edit', { type: 'record.update', record: (renamed(base, anySpeciesId, 'Edited before import').records.species[anySpeciesId]) as AnyRecord })));
    expect(store.canUndo()).toBe(true);
    const beforeState = store.getState();
    const beforeRevision = store.getRevision();

    const { session, ports } = testSession(store);
    const parsed = await parsedFrom(renamed(base, anySpeciesId, 'Imported name'));
    const first = planOf(await session.preview({ parsed, fileName: 'x.orn.json' }));
    const plan = planOf(await session.revise(first.preview.batchId, { resolutions: [{ id: anySpeciesId, resolution: 'replace' }] }));
    const result = await session.apply(plan.preview.batchId, plan);
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);

    expect(ports.calls.slice(0, 2)).toEqual(['snapshot', 'replaceState']);
    expect(ports.snapshots.taken).toHaveLength(1);
    expect(ports.snapshots.taken[0]).toMatchObject({ reason: 'pre_import', revision: beforeRevision });
    expect(ports.snapshots.taken[0]?.state).toBe(beforeState);
    expect(result.revision).toBe(beforeRevision + 1);
    expect(store.getRevision()).toBe(beforeRevision + 1);
    expect(store.canUndo()).toBe(false);
    expect(store.canRedo()).toBe(false);
    expect(store.historyLabels()).toEqual({ undo: [], redo: [] });
    expect((store.getState().records.species[anySpeciesId] as unknown as { names: { canonical: string } }).names.canonical).toBe('Imported name');

    expect(ports.batches.saved).toHaveLength(1);
    expect(ports.batches.saved[0]?.id).toBe(plan.preview.batchId);
    expect(result.reportSaved).toBe(true);
    expect(result.report).toMatchObject({ snapshotId: result.snapshotId, mode: 'merge', revisionBefore: beforeRevision, revisionAfter: beforeRevision + 1 });
    // The findings the store computed for what it applied equal the findings the preview showed for the merged replica.
    expect(store.findings.all().filter((f) => f.severity === 'error')).toEqual([]);
    expect(store.findings.all().length).toBe(plan.preview.findingSummary.error + plan.preview.findingSummary.warning + plan.preview.findingSummary.info + plan.preview.findingSummary.reviewRequired);

    // A used batch cannot be applied twice.
    expect(await session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
  });

  it('replace_all: the file becomes the whole dataset, meta included; conflicts are not offered', async () => {
    const other = produce(base, (draft) => {
      Reflect.deleteProperty(draft.records.species, anySpeciesId);
    });
    void other;
    const store = makeStore(empty);
    mustCommit(store.dispatch(envelope('meta', { type: 'meta.update', meta: { ...base.meta, title: 'Live title' } as never })));
    const { session } = testSession(store);
    const parsed = await parsedFrom(base);
    const plan = planOf(await session.preview({ parsed, fileName: 'backup', request: { mode: 'replace_all' } }));
    expect(plan.mode).toBe('replace_all');
    expect(plan.conflicts).toEqual([]);
    const result = await session.apply(plan.preview.batchId, plan);
    expect(result.ok).toBe(true);
    expect(store.getState().meta).toEqual(base.meta);
    expect(store.getState().records).toEqual(base.records);
  });

  it('replace_all with no usable dataset meta in the file is refused as INVALID_META (nothing pending)', async () => {
    const store = makeStore(empty);
    const { session } = testSession(store);
    const parsed = { ...(await parsedFrom(base)) };
    const { meta: _meta, ...withoutMeta } = parsed;
    void _meta;
    expect(await session.preview({ parsed: withoutMeta, fileName: 'x', request: { mode: 'replace_all' } })).toMatchObject({ ok: false, code: 'INVALID_META' });
    expect(session.pendingBatchId()).toBeUndefined();
  });

  it('stale revision: a commit after the preview makes apply refuse, without a snapshot or any change of its own', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'x' }));
    mustCommit(store.dispatch(envelope('meta', { type: 'meta.update', meta: { ...store.getState().meta, title: 'Changed' } as never })));
    const revision = store.getRevision();
    const result = await session.apply(plan.preview.batchId, plan);
    expect(result).toMatchObject({ ok: false, code: 'STALE_REVISION', message: 'data changed since the preview; run it again' });
    expect(ports.calls).toEqual([]);
    expect(store.getRevision()).toBe(revision);
    expect(await session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
  });

  it('a commit WHILE the snapshot is being written: refused, the snapshot removed again, nothing imported', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'x' }));
    ports.snapshots.duringCreate = () => {
      mustCommit(store.dispatch(envelope('meta', { type: 'meta.update', meta: { ...store.getState().meta, title: 'Raced' } as never })));
    };
    const result = await session.apply(plan.preview.batchId, plan);
    expect(result).toMatchObject({ ok: false, code: 'STALE_REVISION' });
    expect(ports.calls).toEqual(['snapshot', 'snapshot-deleted']);
    expect(Object.keys(store.getState().records.species)).toEqual([]);
  });

  it('a plan that differs from the previewed one is refused (PLAN_MISMATCH); the batch stays valid', async () => {
    const store = makeStore(base);
    const { session } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(renamed(base, anySpeciesId, 'Other')), fileName: 'x' }));
    const tampered: ImportPlan = { ...plan, conflicts: plan.conflicts.map((c) => (c.identical ? c : { ...c, resolution: 'replace' as const })) };
    expect(await session.apply(plan.preview.batchId, tampered)).toMatchObject({ ok: false, code: 'PLAN_MISMATCH' });
    expect(session.pendingBatchId()).toBe(plan.preview.batchId);
    expect((await session.apply(plan.preview.batchId, plan)).ok).toBe(true);
  });

  it('a snapshot that cannot be written stops the import: nothing changed', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    ports.snapshots.failWith = new Error('disk full');
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'x' }));
    expect(await session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED' });
    expect(store.getRevision()).toBe(0);
    expect(ports.calls).toEqual(['snapshot']);
  });

  it('a store that refuses the replacement: REJECTED, snapshot removed, nothing changed', async () => {
    const store = makeStore(empty);
    const ports = fakePorts();
    const refusing = {
      getState: () => store.getState(),
      getRevision: () => store.getRevision(),
      isReadOnly: () => false,
      replaceState: () => ({ ok: false as const, error: { code: 'VALIDATION_FAILED' as const, message: 'refused' } }),
    };
    const { session } = testSession(store, { ports, storePort: refusing });
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'x' }));
    expect(await session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'REJECTED' });
    expect(ports.calls).toEqual(['snapshot', 'clear', 'snapshot-deleted']);
    expect(store.getRevision()).toBe(0);
  });

  it('a read-only tab cannot apply', async () => {
    const store = makeStore(empty, { readOnly: () => true });
    const { session, ports } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'x' }));
    expect(await session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'READ_ONLY' });
    expect(ports.calls).toEqual([]);
  });

  it('a batch store that fails after the import is applied is reported, never thrown: the import stands', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    ports.batches.failWith = new Error('quota');
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'x' }));
    const result = await session.apply(plan.preview.batchId, plan);
    expect(result).toMatchObject({ ok: true, reportSaved: false, reportError: expect.stringContaining('quota') });
    expect(Object.keys(store.getState().records.species).length).toBeGreaterThan(0);
  });
});

describe('quarantine and in-file duplicates', () => {
  it('INV-23 (quarantine on import): records that repeat an ID keep the first and are listed as quarantined; L1 failures are stored as import quarantine rows with the batch ID on apply', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    const parsed = await parsedFrom(base);
    const species = parsed.records.species ?? [];
    const withRepeat = {
      ...parsed,
      records: { ...parsed.records, species: [...species, species[0] as AnyRecord] },
      quarantined: [{ claimedKind: 'concept', claimedId: 'cpt_broken', issues: ['bad'], raw: { id: 'cpt_broken' } as never }],
    };
    const plan = planOf(await session.preview({ parsed: withRepeat, fileName: 'x' }));
    expect(plan.preview.quarantined).toHaveLength(2);
    expect(plan.preview.quarantined[1]?.issues[0]).toContain('repeats an ID');
    expect(plan.preview.counts.species?.incoming).toBe(species.length);
    const result = await session.apply(plan.preview.batchId, plan);
    expect(result.ok).toBe(true);
    expect(ports.batches.quarantine).toHaveLength(2);
    expect(ports.batches.quarantine.every((q) => q.importBatchId === plan.preview.batchId)).toBe(true);
  });
});
