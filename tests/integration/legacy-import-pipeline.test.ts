/**
 * Step 3.11c: the dry run of BOTH legacy fixtures through the real import pipeline (parse 3.6 → port/IDs/mappers 3.8-3.11b → conflicts,
 * merged replica, validation, preview, apply 3.7), into an empty store and into a store holding data/seed/demo.orn.json, with a fixed
 * clock and a fixed ID source. Zero `notImported`; no L1-L3 ERROR blocks confirm; apply succeeds; the applied state is the previewed
 * merged replica; the full report is stored with the batch and is structured-clone-safe. Re-import: the SAME file with the SAME clock
 * resolves every record as `identical_skip`; with a DIFFERENT clock the differing fields are exactly the provenance timestamps.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { canonicalJson, convertLegacy, type ImportPlan, type ImportStorePort } from '@/io';
import { loggingStore, parseBytes, testSession } from '@/test-support/import-kit';
import { legacyBytes, legacyPreview, LEGACY_FIXTURES, stateOfKind, type LegacyFixtureName, type StoreKind } from '@/test-support/legacy-import-kit';
import { makeStore } from '@/test-support/command-kit';

const CASES = LEGACY_FIXTURES.flatMap((name) => (['empty', 'demo'] as const).map((kind): [LegacyFixtureName, StoreKind] => [name, kind]));
const allRecords = (state: CanonicalState): AnyRecord[] => Object.values(state.records).flatMap((table) => Object.values(table as Record<string, AnyRecord>));

function planOf(run: Awaited<ReturnType<typeof legacyPreview>>): ImportPlan {
  if (!run.outcome.ok) throw new Error(`preview refused: ${run.outcome.code} ${run.outcome.message}`);
  return run.outcome.plan;
}

describe('dry run of both fixtures into an empty store and into the demo dataset', () => {
  it.each(CASES)('%s into the %s store: previewed, confirmable, applied; the applied state is the previewed merged replica', async (name, kind) => {
    const store = makeStore(stateOfKind(kind), { revision: 1 });
    const captured: { next?: CanonicalState } = {};
    const calls: string[] = [];
    const base = loggingStore(store, calls);
    const storePort: ImportStorePort = { ...base, replaceState: (next, reason) => ((captured.next = next), base.replaceState(next, reason)) };
    const t = testSession(store, { storePort });
    const parsed = await parseBytes(legacyBytes(name), name);
    const outcome = await t.session.preview({ parsed, fileName: name });
    if (!outcome.ok) throw new Error(`${outcome.code} ${outcome.message}`);
    const { preview } = outcome.plan;

    expect(preview.format).toBe(name.startsWith('v6') ? 'legacy_v6' : 'legacy_v4');
    expect(preview.legacyReport?.notImported).toEqual([]);
    expect(preview.quarantined).toEqual([]);
    expect(preview.findingSummary.error).toBe(0);
    expect(preview.canConfirm).toBe(true);
    expect(preview.blockers).toEqual([]);
    expect(preview.conflicts).toEqual([]); // nothing of the file exists yet

    const applied = await t.session.apply(preview.batchId, outcome.plan);
    if (!applied.ok) throw new Error(`${applied.code} ${applied.message}`);
    expect(applied.reportSaved).toBe(true);
    expect(captured.next).toBeDefined();
    const live = store.getState();
    expect(allRecords(live)).toHaveLength(preview.mergedRecordCount);
    expect(canonicalJson(live.records)).toBe(canonicalJson((captured.next as CanonicalState).records));
    // the demo dataset survived untouched
    if (kind === 'demo') for (const record of allRecords(stateOfKind('demo'))) expect(canonicalJson(live.records[record.kind][record.id as never])).toBe(canonicalJson(record));
    // every mapped record is in the applied state
    for (const [recordKind, count] of Object.entries(preview.counts)) expect(Object.keys(live.records[recordKind as AnyRecord['kind']]).length).toBeGreaterThanOrEqual(count?.incoming ?? 0);
  });

  it.each(CASES)('%s into the %s store: the full report is stored with the batch, equals the preview\'s, and is structured-clone- and JSON-safe', async (name, kind) => {
    const run = await legacyPreview(legacyBytes(name), kind);
    const plan = planOf(run);
    const applied = await run.session.apply(plan.preview.batchId, plan);
    if (!applied.ok) throw new Error(applied.message);
    const report = plan.preview.legacyReport;
    expect(report).toBeDefined();
    expect(structuredClone(report)).toEqual(report);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    const stored = run.ports.batches.saved[0]?.report as { legacyReport?: unknown; decisions: unknown };
    expect(JSON.parse(JSON.stringify(stored.legacyReport))).toEqual(JSON.parse(JSON.stringify(report)));
    expect(stored.decisions).toEqual(plan.decisions);
    expect(applied.report.legacyReport).toEqual(report);
    for (const key of ['sourceSystem', 'sourceSchemaVersion', 'createdCounts', 'reviewItems', 'preservedUnmappedFields', 'notImported', 'consumedByDefault', 'notes', 'documentUnmapped', 'collisions', 'unsafeKeysRenamed', 'decisions', 'reagentFamilies']) {
      expect(report, key).toHaveProperty(key);
    }
    expect(report?.decisions).toEqual(plan.preview.decisions);
  });

  it.each(CASES)('%s into the %s store: the report\'s created counts are the previewed counts of the file', async (name, kind) => {
    const plan = planOf(await legacyPreview(legacyBytes(name), kind));
    const created = plan.preview.legacyReport?.createdCounts ?? {};
    for (const [recordKind, count] of Object.entries(plan.preview.counts)) expect(created[recordKind as AnyRecord['kind']], recordKind).toBe(count?.incoming);
    expect(Object.keys(created).sort()).toEqual(Object.keys(plan.preview.counts).sort());
  });

  it('the demo dataset changes what is matched: an empty store creates the chapter topics, the demo store reuses its own', async () => {
    const empty = planOf(await legacyPreview(legacyBytes('v6-demo-export.json'), 'empty'));
    const demo = planOf(await legacyPreview(legacyBytes('v6-demo-export.json'), 'demo'));
    expect(empty.preview.counts.topic?.incoming).toBe(5);
    expect(demo.preview.counts.topic?.incoming).toBe(4);
    expect(empty.preview.counts.exam_relevance).toBeUndefined();
    expect(demo.preview.counts.exam_relevance?.incoming).toBe(42);
  });
});

describe('re-import of an applied fixture', () => {
  async function applied(name: LegacyFixtureName, kind: StoreKind) {
    const first = await legacyPreview(legacyBytes(name), kind);
    const plan = planOf(first);
    const result = await first.session.apply(plan.preview.batchId, plan);
    if (!result.ok) throw new Error(result.message);
    return first;
  }

  it.each(CASES)('%s into the %s store, the SAME file and the SAME clock: every record resolves as identical_skip', async (name, kind) => {
    const first = await applied(name, kind);
    const again = planOf(await legacyPreview(legacyBytes(name), kind, { store: first.store }));
    const counts = Object.values(again.preview.counts);
    expect(counts.every((c) => c?.new === 0 && c.conflicting === 0 && c.identical === c.incoming)).toBe(true);
    expect(again.conflicts.length).toBe(counts.reduce((sum, c) => sum + (c?.incoming ?? 0), 0));
    expect(again.conflicts.every((c) => c.identical && c.resolution === 'identical_skip')).toBe(true);
    expect(again.preview.canConfirm).toBe(true);
    expect(again.preview.findingSummary.error).toBe(0);
  });

  /** Every leaf path at which two JSON values differ (`a.b[2]`); a path present on one side only counts. */
  function differences(a: unknown, b: unknown, path = ''): string[] {
    if (JSON.stringify(a) === JSON.stringify(b)) return [];
    const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
    if (!isObj(a) || !isObj(b) || Array.isArray(a) !== Array.isArray(b)) return [path];
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    return keys.flatMap((key) => differences(a[key], b[key], Array.isArray(a) ? `${path}[${key}]` : `${path}${path === '' ? '' : '.'}${key}`));
  }

  it.each(CASES)('%s into the %s store, the SAME file with a DIFFERENT clock: exactly the provenance timestamps differ, on every record', async (name, kind) => {
    const first = await applied(name, kind);
    const live = first.store.getState();
    const parsed = await parseBytes(legacyBytes(name), name);
    const converted = await convertLegacy({ parsed, live, now: () => new Date(1_800_000_000_000).toISOString(), request: undefined });
    if (!converted.ok) throw new Error(converted.message);
    const paths = new Set<string>();
    let compared = 0;
    for (const list of Object.values(converted.parsed.records)) {
      for (const incoming of list ?? []) {
        const current = live.records[incoming.kind][incoming.id as never] as unknown;
        expect(current, incoming.id).toBeDefined();
        const diff = differences(current, incoming);
        expect(diff.length, incoming.id).toBeGreaterThan(0);
        for (const path of diff) paths.add(path);
        compared += 1;
      }
    }
    expect([...paths].sort()).toEqual(['provenance.createdAt', 'provenance.updatedAt']);
    // so the default resolution is keep_current for all of them and nothing is lost, but nothing is recognised as identical either
    const again = planOf(await legacyPreview(legacyBytes(name), kind, { store: first.store, nowMs: 1_800_000_000_000 }));
    expect(again.conflicts).toHaveLength(compared);
    expect(again.conflicts.every((c) => !c.identical && c.resolution === 'keep_current')).toBe(true);
  });
});
