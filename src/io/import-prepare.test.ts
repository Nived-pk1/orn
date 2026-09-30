/**
 * The pure half of apply (step 4.2c): `prepareApply` makes the same refusals as `apply` (UNKNOWN_BATCH, PLAN_MISMATCH, a stale
 * revision, BLOCKED) without any port, hands back the payload, leaves the batch pending, and a session without write ports
 * cannot apply. The report draft plus the applier's time and snapshot ID is exactly the report `apply` stores.
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { createIdFactory } from '@/core/dataset';
import { makeStore, mulberry32 } from '@/test-support/command-kit';
import { parsedFrom, testSession } from '@/test-support/import-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { ImportPlan } from './contracts';
import { completeReport } from './import-apply';
import { createImportSession } from './import-session';

const base = loadFixtureState('maximal-valid');
const empty: CanonicalState = { meta: base.meta, records: emptyRecordTables() };
const speciesId = Object.keys(base.records.species)[0] as string;

function planOf(outcome: { readonly ok: boolean; readonly plan?: ImportPlan }): ImportPlan {
  if (!outcome.ok || outcome.plan === undefined) throw new Error('preview refused');
  return outcome.plan;
}

/** A session that previews only: a store view without `replaceState` and no write ports (the compute worker's). */
function previewOnly(store: ReturnType<typeof makeStore>) {
  return createImportSession({
    store: { getState: () => store.getState(), getRevision: () => store.getRevision() },
    ids: createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: mulberry32(7) }),
  });
}

describe('prepareApply', () => {
  it('returns the merged replica, the assets, the report draft and the quarantine rows; the batch stays pending until consumed', async () => {
    const store = makeStore(empty);
    const session = previewOnly(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'a.orn.json' }));
    const outcome = session.prepareApply(plan.preview.batchId, plan, store.getRevision());
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.prepared).toMatchObject({ batchId: plan.preview.batchId, fileName: 'a.orn.json', baseRevision: 0 });
    expect(outcome.prepared.report).toMatchObject({ revisionBefore: 0, revisionAfter: 1, mode: 'merge', quarantinedCount: 0 });
    expect(outcome.prepared.report).not.toHaveProperty('snapshotId');
    expect(Object.keys(outcome.prepared.merged.records.species).length).toBe(Object.keys(base.records.species).length);
    expect(session.pendingBatchId()).toBe(plan.preview.batchId);
    expect(session.prepareApply(plan.preview.batchId, plan, 0).ok).toBe(true); // a retry after a failed apply
    expect(session.consume(plan.preview.batchId)).toBe(true);
    expect(session.consume(plan.preview.batchId)).toBe(false);
    expect(session.prepareApply(plan.preview.batchId, plan, 0)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
  });

  it('completed with a time and a snapshot ID the draft is the report apply stores', async () => {
    const store = makeStore(empty);
    const twin = makeStore(empty);
    const parsed = await parsedFrom(base);
    const prepared = previewOnly(store);
    const plan = planOf(await prepared.preview({ parsed, fileName: 'a' }));
    const outcome = prepared.prepareApply(plan.preview.batchId, plan, 0);
    if (!outcome.ok) throw new Error(outcome.message);
    const { session, ports } = testSession(twin);
    const twinPlan = planOf(await session.preview({ parsed, fileName: 'a' }));
    const applied = await session.apply(twinPlan.preview.batchId, twinPlan);
    if (!applied.ok) throw new Error(applied.message);
    expect(twinPlan.preview.batchId).toBe(plan.preview.batchId);
    expect(applied.report).toEqual(completeReport(outcome.prepared.report, applied.report.appliedAt, applied.snapshotId));
    expect(ports.batches.saved).toHaveLength(1);
  });

  it('refuses as values: unknown batch, a plan that differs (the batch stays), a stale revision (the batch is consumed), an unconfirmable plan', async () => {
    const store = makeStore(base);
    const session = previewOnly(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(produce(base, (d) => { (d.records.species[speciesId] as unknown as { names: { canonical: string } }).names.canonical = 'Other'; })), fileName: 'x' }));
    expect(session.prepareApply('imp_unknown', plan, 0)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    const tampered: ImportPlan = { ...plan, conflicts: plan.conflicts.map((c) => (c.identical ? c : { ...c, resolution: 'replace' as const })) };
    expect(session.prepareApply(plan.preview.batchId, tampered, 0)).toMatchObject({ ok: false, code: 'PLAN_MISMATCH' });
    expect(session.pendingBatchId()).toBe(plan.preview.batchId);
    expect(session.prepareApply(plan.preview.batchId, plan, 5)).toMatchObject({ ok: false, code: 'STALE_REVISION', message: 'data changed since the preview; run it again' });
    expect(session.pendingBatchId()).toBeUndefined();

    const emptyStore = makeStore(empty);
    const blocked = previewOnly(emptyStore);
    const dangling = produce(base, (d) => { Reflect.deleteProperty(d.records.species, speciesId); });
    const bad = planOf(await blocked.preview({ parsed: await parsedFrom(dangling), fileName: 'd' }));
    expect(blocked.prepareApply(bad.preview.batchId, bad, 0)).toMatchObject({ ok: false, code: 'BLOCKED' });
    expect(blocked.pendingBatchId()).toBe(bad.preview.batchId);
  });

  it('pendingBaseRevision is the revision the preview was built on; a session without write ports cannot apply (REJECTED, nothing written)', async () => {
    const store = makeStore(base, { revision: 4 });
    const session = previewOnly(store);
    expect(session.pendingBaseRevision()).toBeUndefined();
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'x' }));
    expect(session.pendingBaseRevision()).toBe(4);
    expect(await session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'REJECTED' });
    expect(store.getRevision()).toBe(4);
  });
});
