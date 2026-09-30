/**
 * Import part 2 (step 3.7): conflict analysis, merged replica, preview and apply against a real canonical store with recording
 * fake ports. INV-21 (preview and cancel change nothing; apply is atomic after a snapshot), ADV-030, ADV-042 (all four
 * resolutions), ADV-045 import part (history cleared), the pending-batch rules (Q12).
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { referenceEngine } from '@/core/references';
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import { makeStore, ref } from '@/test-support/command-kit';
import { parsedFrom, testSession } from '@/test-support/import-kit';
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

describe('preview: INV-21 (nothing changes before confirmation)', () => {
  it('a preview into an empty store changes no state, revision, history or port', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    const seen: unknown[] = [];
    store.subscribe((c) => seen.push(c));
    const before = store.getState();
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'a.orn.json' }));
    expect(plan.mode).toBe('merge');
    expect(plan.conflicts).toEqual([]);
    expect(plan.preview.canConfirm).toBe(true);
    expect(plan.preview.mergedRecordCount).toBe(Object.values(base.records).reduce((n, t) => n + Object.keys(t).length, 0));
    expect(store.getState()).toBe(before);
    expect(store.getRevision()).toBe(0);
    expect(seen).toEqual([]);
    expect(ports.calls).toEqual([]);
  });

  it('cancel discards the batch and changes nothing; the cancelled batch cannot be applied', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'a' }));
    expect(session.pendingBatchId()).toBe(plan.preview.batchId);
    expect(session.cancel(plan.preview.batchId)).toBe(true);
    expect(session.cancel(plan.preview.batchId)).toBe(false);
    expect(session.pendingBatchId()).toBeUndefined();
    expect(await session.apply(plan.preview.batchId, plan)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
    expect(store.getRevision()).toBe(0);
    expect(ports.calls).toEqual([]);
  });

  it('at most one pending batch: a new preview discards the old one', async () => {
    const store = makeStore(empty);
    const { session } = testSession(store);
    const parsed = await parsedFrom(base);
    const first = planOf(await session.preview({ parsed, fileName: 'a' }));
    const second = planOf(await session.preview({ parsed, fileName: 'b' }));
    expect(second.preview.batchId).not.toBe(first.preview.batchId);
    expect(session.pendingBatchId()).toBe(second.preview.batchId);
    expect(await session.apply(first.preview.batchId, first)).toMatchObject({ ok: false, code: 'UNKNOWN_BATCH' });
  });

  it('a legacy format without a usable payload is refused as a value (LEGACY_INVALID); legacy imports are converted since step 3.11c', async () => {
    const store = makeStore(empty);
    const { session } = testSession(store);
    const parsed = { ...(await parsedFrom(base)), format: 'legacy_v6' as const };
    expect(await session.preview({ parsed, fileName: 'legacy.json' })).toMatchObject({ ok: false, code: 'LEGACY_INVALID' });
  });

  it('an aborted signal returns CANCELLED and leaves the pending batch alone', async () => {
    const store = makeStore(empty);
    const { session } = testSession(store);
    const parsed = await parsedFrom(base);
    const first = planOf(await session.preview({ parsed, fileName: 'a' }));
    const controller = new AbortController();
    controller.abort();
    expect(await session.preview({ parsed, fileName: 'a' }, { signal: controller.signal })).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(session.pendingBatchId()).toBe(first.preview.batchId);
  });
});

describe('conflict analysis and the four resolutions (ADV-042)', () => {
  it('identical records are decided by canonical deep equality and default to identical_skip; the merged replica equals live', async () => {
    const store = makeStore(base);
    const { session } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(base), fileName: 'same' }));
    expect(plan.conflicts.length).toBe(plan.preview.mergedRecordCount);
    expect(plan.conflicts.every((c) => c.identical && c.resolution === 'identical_skip')).toBe(true);
    const total = Object.values(plan.preview.counts).reduce((n, c) => n + (c?.identical ?? 0), 0);
    expect(total).toBe(plan.preview.mergedRecordCount);
    expect(plan.preview.canConfirm).toBe(true);
  });

  it('a differing record defaults to keep_current (non-destructive); identical_skip is refused for it', async () => {
    const store = makeStore(base);
    const { session } = testSession(store);
    const parsed = await parsedFrom(renamed(base, anySpeciesId, 'A different name'));
    const plan = planOf(await session.preview({ parsed, fileName: 'x' }));
    const conflict = plan.conflicts.find((c) => c.ref.id === anySpeciesId);
    expect(conflict).toMatchObject({ identical: false, resolution: 'keep_current' });
    expect(plan.conflicts.filter((c) => !c.identical)).toHaveLength(1);
    const refused = await session.revise(plan.preview.batchId, { resolutions: [{ id: anySpeciesId, resolution: 'identical_skip' }] });
    expect(refused).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
  });

  it('replace: apply puts the incoming version in; keep_current: the live one stays', async () => {
    for (const resolution of ['replace', 'keep_current'] as const) {
      const store = makeStore(base);
      const { session } = testSession(store);
      const parsed = await parsedFrom(renamed(base, anySpeciesId, 'A different name'));
      const first = planOf(await session.preview({ parsed, fileName: 'x' }));
      const plan = planOf(await session.revise(first.preview.batchId, { resolutions: [{ id: anySpeciesId, resolution }] }));
      const result = await session.apply(plan.preview.batchId, plan);
      expect(result.ok).toBe(true);
      const name = (store.getState().records.species[anySpeciesId] as unknown as { names: { canonical: string } }).names.canonical;
      expect(name).toBe(resolution === 'replace' ? 'A different name' : (base.records.species[anySpeciesId] as unknown as { names: { canonical: string } }).names.canonical);
    }
  });

  it('import_as_copy: new IDs from the injected factory (deterministic), nested IDs renewed, references and [[links]] rewired, count reported', async () => {
    const everything = (Object.values(base.records) as Record<string, AnyRecord>[]).flatMap((table) => Object.values(table));
    const referrer = everything.find((r) => r.kind === 'route' && referenceEngine.extract(r).some((e) => e.targetKind === 'reaction'));
    if (referrer === undefined) throw new Error('fixture has no route referencing a reaction');
    const reaction = base.records.reaction[referenceEngine.extract(referrer).find((e) => e.targetKind === 'reaction')?.targetId as string] as AnyRecord;
    const incoming = produce(base, (draft) => {
      const target = (draft.records[referrer.kind] as unknown as Record<string, { notes?: string }>)[referrer.id] as { notes?: string };
      target.notes = `Compare [[${reaction.id}]] and [[${anySpeciesId}]].`;
    });
    const run = async () => {
      const store = makeStore(base);
      const { session } = testSession(store, { seed: 11 });
      const parsed = await parsedFrom(incoming);
      const first = planOf(await session.preview({ parsed, fileName: 'x' }));
      const plan = planOf(
        await session.revise(first.preview.batchId, {
          resolutions: [
            { id: reaction.id, resolution: 'import_as_copy' },
            { id: referrer.id, resolution: 'replace' },
          ],
        }),
      );
      const applied = await session.apply(plan.preview.batchId, plan);
      return { store, plan, applied };
    };
    const one = await run();
    const two = await run();
    expect(one.plan.copyIdMap).toEqual(two.plan.copyIdMap); // deterministic under the same seeded factory
    expect(one.plan.preview.canConfirm).toBe(true);
    expect(one.applied.ok).toBe(true);

    const newId = one.plan.copyIdMap.find((m) => m.from === reaction.id)?.to;
    if (newId === undefined) throw new Error('no copy ID for the reaction');
    const nestedOld = referenceEngine.nestedIds(reaction).map((n) => n.id);
    expect(nestedOld.length).toBeGreaterThan(0);
    for (const id of nestedOld) expect(one.plan.copyIdMap.find((m) => m.from === id)?.to).toBeDefined();

    const state = one.store.getState();
    expect(state.records.reaction[reaction.id]).toBe(base.records.reaction[reaction.id]); // the live original is untouched
    const copy = state.records.reaction[newId] as AnyRecord;
    expect(copy).toBeDefined();
    const nestedNew = referenceEngine.nestedIds(copy).map((n) => n.id);
    expect(nestedNew.some((id) => nestedOld.includes(id))).toBe(false);

    const merged = (state.records[referrer.kind] as Record<string, AnyRecord>)[referrer.id] as AnyRecord & { notes?: string };
    expect(referenceEngine.extract(merged).some((e) => e.targetId === reaction.id)).toBe(false);
    expect(referenceEngine.extract(merged).some((e) => e.targetId === newId)).toBe(true);
    expect(merged.notes).toBe(`Compare [[${newId}]] and [[${anySpeciesId}]].`); // the link outside the copied set is untouched
    expect(one.plan.preview.richTextLinksRewritten).toBeGreaterThanOrEqual(1);
  });

  it('copy IDs stay the same across revisions of one plan', async () => {
    const reaction = Object.values(base.records.reaction)[0] as AnyRecord;
    const store = makeStore(base);
    const { session } = testSession(store);
    const parsed = await parsedFrom(base);
    const first = planOf(await session.preview({ parsed, fileName: 'x' }));
    const request = { resolutions: [{ id: reaction.id, resolution: 'import_as_copy' as const }] };
    const a = planOf(await session.revise(first.preview.batchId, request));
    const b = planOf(await session.revise(a.preview.batchId, { ...request, excluded: [ref('species', anySpeciesId)] }));
    expect(b.copyIdMap).toEqual(a.copyIdMap);
  });
});

describe('request validation', () => {
  it('refuses contradictions as values', async () => {
    const store = makeStore(base);
    const { session } = testSession(store);
    const plan = planOf(await session.preview({ parsed: await parsedFrom(renamed(base, anySpeciesId, 'Other')), fileName: 'x' }));
    const id = plan.preview.batchId;
    expect(await session.revise(id, { resolutions: [{ id: 'spc_not-there', resolution: 'replace' }] })).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(await session.revise(id, { excluded: [ref('species', 'spc_not-there')] })).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(await session.revise(id, { mode: 'replace_all', resolutions: [{ id: anySpeciesId, resolution: 'replace' }] })).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(
      await session.revise(id, { resolutions: [{ id: anySpeciesId, resolution: 'replace' }], excluded: [ref('species', anySpeciesId)] }),
    ).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(await session.revise(id, { resolutions: [{ id: anySpeciesId, resolution: 'replace' }, { id: anySpeciesId, resolution: 'keep_current' }] })).toMatchObject({ ok: false, code: 'INVALID_REQUEST' });
    expect(session.pendingBatchId()).toBe(id); // a refused revision leaves the batch as it was
  });
});

describe('ADV-030: dangling references block confirmation until resolved', () => {
  const dangling = (): CanonicalState => {
    const speciesId = Object.values(base.records.reaction).flatMap((r) => referenceEngine.extract(r)).find((e) => e.targetKind === 'species')?.targetId as string;
    return produce(base, (draft) => {
      Reflect.deleteProperty(draft.records.species, speciesId);
    });
  };

  it('importing a reaction whose participant is missing from the file and the store: findings on the merged replica, confirm blocked, apply refused, nothing applied; excluding the offenders unblocks it', async () => {
    const store = makeStore(empty);
    const { session, ports } = testSession(store);
    const parsed = await parsedFrom(dangling());
    const plan = planOf(await session.preview({ parsed, fileName: 'dangling.orn.json' }));
    expect(plan.preview.canConfirm).toBe(false);
    expect(plan.preview.findingSummary.error).toBeGreaterThan(0);
    expect(plan.preview.findings.some((f) => f.severity === 'error')).toBe(true);
    expect(plan.preview.blockers.length).toBe(1);
    const refused = await session.apply(plan.preview.batchId, plan);
    expect(refused).toMatchObject({ ok: false, code: 'BLOCKED' });
    expect(store.getRevision()).toBe(0);
    expect(ports.calls).toEqual([]); // not even a snapshot

    const offenders = [...new Set(plan.preview.findings.filter((f) => f.severity === 'error').map((f) => f.subject))];
    const revised = planOf(await session.revise(plan.preview.batchId, { excluded: offenders }));
    // Excluding an offender can expose its referrers; keep excluding until clean (bounded).
    let current = revised;
    for (let i = 0; i < 20 && !current.preview.canConfirm; i += 1) {
      const more = current.preview.findings.filter((f) => f.severity === 'error').map((f) => f.subject);
      current = planOf(await session.revise(current.preview.batchId, { excluded: [...current.excluded, ...more] }));
    }
    expect(current.preview.canConfirm).toBe(true);
    expect(current.excluded.length).toBeGreaterThan(0);
    const applied = await session.apply(current.preview.batchId, current);
    expect(applied.ok).toBe(true);
    for (const excluded of current.excluded) expect((store.getState().records[excluded.kind] as Record<string, unknown>)[excluded.id]).toBeUndefined();
  });
});
