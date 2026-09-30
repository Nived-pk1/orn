/**
 * Step 3.11c: the legacy leg of the import session: preview decisions (hub class / species, `reagentFamily` values), the full
 * `LegacyImportReport`, the match context built from the LIVE state, and INV-21 for legacy (a cancelled or failed legacy import changes
 * nothing). Real parser, real store, recording fake ports.
 */
import { describe, expect, it } from 'vitest';
import { hash64 } from '@/core/hash';
import type { Reaction } from '@/core/schema';
import { makeStore } from '@/test-support/command-kit';
import { parsedFrom, parseBytes, testSession } from '@/test-support/import-kit';
import { legacyBytes, legacyPreview, stateOfKind } from '@/test-support/legacy-import-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { ImportPlan, ImportPreviewOutcome } from './contracts';

const V6 = 'v6-demo-export.json';
const planOf = (outcome: ImportPreviewOutcome): ImportPlan => {
  if (!outcome.ok) throw new Error(`preview refused: ${outcome.code} ${outcome.message}`);
  return outcome.plan;
};
const bytesOf = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe('preview decisions', () => {
  it('one decision per hub (class by default) and one per distinct reagentFamily value (keep, the only option: the schema has no field for it)', async () => {
    const plan = planOf((await legacyPreview(legacyBytes(V6), 'empty')).outcome);
    const hubs = plan.decisions.filter((d) => d.id.startsWith('hub:'));
    const families = plan.decisions.filter((d) => d.id.startsWith('reagent_family:'));
    expect(hubs).toHaveLength(13);
    expect(hubs.every((d) => d.chosen === 'class' && d.options.join() === 'class,species' && d.subject.kind === 'class')).toBe(true);
    expect(hubs[0]).toMatchObject({ id: 'hub:c1', subject: { kind: 'class', id: 'cls_v6-c1' } });
    expect(families).toHaveLength(19);
    expect(families.every((d) => d.chosen === 'keep' && d.options.join() === 'keep' && d.subject.kind === 'reaction')).toBe(true);
    expect(families.find((d) => d.id === 'reagent_family:HBr')?.question).toContain('2 reactions');
    expect(plan.preview.decisions).toEqual(plan.decisions);
    expect(plan.preview.legacyReport?.decisions).toEqual(plan.decisions);
    expect(plan.preview.legacyReport?.reagentFamilies).toHaveLength(19);
  });

  it('a hub decided as species is a revise with the FULL request: a new batch, the old one is gone, the species replaces the class', async () => {
    const run = await legacyPreview(legacyBytes(V6), 'empty');
    const first = planOf(run.outcome);
    const revised = planOf(await run.session.revise(first.preview.batchId, { decisions: [{ id: 'hub:c1', chosen: 'species' }] }));
    expect(revised.preview.batchId).not.toBe(first.preview.batchId);
    expect(await run.session.apply(first.preview.batchId, first)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(revised.decisions.find((d) => d.id === 'hub:c1')).toMatchObject({ chosen: 'species', subject: { kind: 'species', id: 'spc_v6-c1' } });
    expect(revised.decisions.filter((d) => d.chosen === 'species')).toHaveLength(1);
    const applied = await run.session.apply(revised.preview.batchId, revised);
    if (!applied.ok) throw new Error(applied.message);
    const records = run.store.getState().records;
    expect(records.species['spc_v6-c1' as never]).toBeDefined();
    expect(records.class['cls_v6-c1' as never]).toBeUndefined();
    const stored = run.ports.batches.saved[0]?.report as { decisions: { id: string; chosen: string }[]; legacyReport: { decisions: { id: string; chosen: string }[] } };
    expect(stored.decisions.find((d) => d.id === 'hub:c1')?.chosen).toBe('species');
    expect(stored.legacyReport.decisions.find((d) => d.id === 'hub:c1')?.chosen).toBe('species');
  });

  it('a revise is the FULL desired state: leaving a decision out puts it back to its default', async () => {
    const run = await legacyPreview(legacyBytes(V6), 'empty');
    const a = planOf(await run.session.revise(planOf(run.outcome).preview.batchId, { decisions: [{ id: 'hub:c1', chosen: 'species' }, { id: 'hub:c2', chosen: 'species' }] }));
    const b = planOf(await run.session.revise(a.preview.batchId, { decisions: [{ id: 'hub:c2', chosen: 'species' }] }));
    expect(b.decisions.filter((d) => d.chosen === 'species').map((d) => d.id)).toEqual(['hub:c2']);
  });

  it('apply refuses a plan whose decisions differ from the previewed ones (PLAN_MISMATCH); nothing changes', async () => {
    const run = await legacyPreview(legacyBytes(V6), 'empty');
    const plan = planOf(run.outcome);
    const tampered: ImportPlan = { ...plan, decisions: plan.decisions.map((d) => (d.id === 'hub:c1' ? { ...d, chosen: 'species' } : d)) };
    const before = run.store.getState();
    expect(await run.session.apply(plan.preview.batchId, tampered)).toMatchObject({ ok: false, code: 'PLAN_MISMATCH' });
    expect(run.store.getState()).toBe(before);
    expect(run.ports.calls).toEqual([]);
    expect(await run.session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: true });
  });

  it.each([
    ['an unknown decision', { decisions: [{ id: 'hub:nope', chosen: 'class' }] }, /no decision "hub:nope"/],
    ['an option the decision does not have (a hub)', { decisions: [{ id: 'hub:c1', chosen: 'both' }] }, /has no option "both"/],
    ['an option the decision does not have (reagentFamily: only keep)', { decisions: [{ id: 'reagent_family:aq. KOH', chosen: 'map' }] }, /has no option "map"/],
  ])('%s is refused as INVALID_REQUEST', async (_name, request, message) => {
    const run = await legacyPreview(legacyBytes(V6), 'empty');
    const first = planOf(run.outcome);
    const refused = await run.session.revise(first.preview.batchId, request);
    expect(refused).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(refused.ok ? '' : refused.message).toMatch(message);
    expect(run.session.pendingBatchId()).toBe(first.preview.batchId); // a refused revise keeps the pending batch
  });

  it('decisions are for legacy imports only', async () => {
    const store = makeStore(stateOfKind('empty'));
    const { session } = testSession(store);
    const parsed = await parsedFrom(loadFixtureState('maximal-valid'));
    expect(await session.preview({ parsed, fileName: 'x', request: { decisions: [{ id: 'hub:c1', chosen: 'species' }] } })).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(await session.preview({ parsed, fileName: 'x', request: { decisions: [] } })).toMatchObject({ ok: true });
  });
});

describe('the match context is the LIVE state at preview time', () => {
  it('the same file: an empty store creates the chapter topics, the demo store reuses its own topic and links exams', async () => {
    const empty = planOf((await legacyPreview(legacyBytes(V6), 'empty')).outcome);
    const demo = await legacyPreview(legacyBytes(V6), 'demo');
    const plan = planOf(demo.outcome);
    expect(empty.preview.legacyReport?.createdCounts.topic).toBe(5);
    expect(plan.preview.legacyReport?.createdCounts.topic).toBe(4);
    expect(plan.preview.legacyReport?.createdCounts.exam_relevance).toBe(42);
    const applied = await demo.session.apply(plan.preview.batchId, plan);
    expect(applied.ok).toBe(true);
    const r1 = demo.store.getState().records.reaction['rxn_v6-r1' as never] as Reaction;
    expect(r1.reactionTypes[0]?.conceptId).toBe('cpt_addition');
  });

  it('a live change between preview and apply is refused as stale (the context went stale with it)', async () => {
    const run = await legacyPreview(legacyBytes(V6), 'demo');
    const plan = planOf(run.outcome);
    run.store.replaceState(stateOfKind('demo'), 'import'); // any revision bump
    expect(await run.session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'STALE_REVISION' });
  });
});

describe('the report shows what only the whole import knows', () => {
  it('documentUnmapped and unsafeKeysRenamed reach the preview and the stored report', async () => {
    const text = '{"schemaVersion":5,"title":"my export","compounds":[{"id":"c1","name":"A"}],"reactions":[],"__proto__":{"x":1}}';
    const run = await legacyPreview(new TextEncoder().encode(text), 'empty');
    const plan = planOf(run.outcome);
    const report = plan.preview.legacyReport;
    expect(report?.documentUnmapped.title).toBe('my export');
    expect(Object.keys(report?.documentUnmapped ?? {}).some((k) => k.startsWith('__unsafe_key__'))).toBe(true);
    expect(report?.unsafeKeysRenamed).toEqual(plan.preview.unsafeKeysRenamed);
    expect(report?.unsafeKeysRenamed.length).toBeGreaterThan(0);
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    const applied = await run.session.apply(plan.preview.batchId, plan);
    expect(applied.ok).toBe(true);
    const stored = run.ports.batches.saved[0]?.report as { legacyReport: { documentUnmapped: Record<string, unknown>; unsafeKeysRenamed: unknown[] } };
    expect(stored.legacyReport.documentUnmapped.title).toBe('my export');
    expect(stored.legacyReport.unsafeKeysRenamed).toHaveLength(report?.unsafeKeysRenamed.length ?? -1);
  });

  it('ID-space collisions are listed (an original that already looks like a produced part)', async () => {
    const compounds = [{ id: 'c15!', name: 'A' }, { id: `c15--${hash64('c15!').slice(0, 6)}`, name: 'B' }, { id: 'c1', name: 'C' }];
    const run = await legacyPreview(bytesOf({ schemaVersion: 5, compounds, reactions: [] }), 'empty');
    const report = planOf(run.outcome).preview.legacyReport;
    expect(report?.collisions).toHaveLength(1);
    expect(report?.collisions[0]?.originals).toHaveLength(2);
    expect(report?.collisions[0]?.namespace).toContain('compound');
    expect(report?.collisions[0]?.resolved.map((r) => r.original).sort()).toEqual(report?.collisions[0]?.originals);
  });
});

describe('INV-21 for legacy: a cancelled or failed legacy import changes nothing', () => {
  it('an aborted preview returns CANCELLED, nothing pending, nothing written', async () => {
    const store = makeStore(stateOfKind('demo'), { revision: 1 });
    const t = testSession(store);
    const parsed = await parseBytes(legacyBytes(V6), 'x.json');
    const controller = new AbortController();
    controller.abort();
    const before = store.getState();
    expect(await t.session.preview({ parsed, fileName: 'x' }, { signal: controller.signal })).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(t.session.pendingBatchId()).toBeUndefined();
    expect(store.getState()).toBe(before);
    expect(t.ports.calls).toEqual([]);
  });

  it('a payload that cannot be converted is LEGACY_INVALID and leaves the pending batch alone', async () => {
    const run = await legacyPreview(legacyBytes(V6), 'empty');
    const pending = run.session.pendingBatchId();
    const parsed = await parseBytes(legacyBytes(V6), 'x.json');
    const broken = { ...parsed, legacyPayload: [1, 2] };
    expect(await run.session.preview({ parsed: broken, fileName: 'broken' })).toMatchObject({ ok: false, code: 'LEGACY_INVALID' });
    expect(run.session.pendingBatchId()).toBe(pending); // a failed preview does not replace the pending one
  });

  it('a failed snapshot at apply changes nothing (no replaceState, no batch, no staged assets)', async () => {
    const run = await legacyPreview(legacyBytes(V6), 'demo');
    const plan = planOf(run.outcome);
    run.ports.snapshots.failWith = new Error('disk full');
    const before = run.store.getState();
    expect(await run.session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'SNAPSHOT_FAILED' });
    expect(run.store.getState()).toBe(before);
    expect(run.ports.batches.saved).toEqual([]);
    expect(run.ports.calls).not.toContain('replaceState');
    // preview and revise themselves never wrote anything either
    expect(run.ports.calls.filter((c) => c !== 'snapshot')).toEqual([]);
  });

  it('cancel discards the legacy batch; the store is exactly as it was', async () => {
    const run = await legacyPreview(legacyBytes(V6), 'demo');
    const before = run.store.getState();
    expect(run.session.cancel(planOf(run.outcome).preview.batchId)).toBe(true);
    expect(run.store.getState()).toBe(before);
    expect(run.ports.calls).toEqual([]);
  });
});
