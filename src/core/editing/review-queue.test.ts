/**
 * The review queue's model (step 6.8b, R1): every record whose review status is not "verified", filtered and sorted, and the two bulk
 * actions as ONE envelope each. "Mark verified" is refused for a record with an ERROR finding, lists the warnings for a confirm, sets
 * `reviewedAt` from the injected clock and keeps the reasons; "Needs review" needs a reason. The app never verifies anything by itself.
 */
import { describe, expect, it } from 'vitest';
import { makeStore, mustCommit, recordIn, ref } from '../../test-support/command-kit';
import { loadFixtureState } from '../../test-support/state-fixture';
import type { AnyRecord, CanonicalState, RecordRef } from '../schema';
import { markVerifiedEnvelope, needsReviewEnvelope, queueRows, verifyPlan, type FindingsOf, type QueueFilters } from './review-queue';

const NOW = '2026-10-23T12:00:00.000Z';
type Reviewed = AnyRecord & { review: { lifecycle: string; status: string; reasons: string[]; reviewedAt?: string }; provenance: { origin: 'user' | 'seed' | 'import' | 'legacy_import' | 'generated'; updatedAt: string }; tags: string[] };

/** The maximal fixture with these records' review and update time set. */
function withReviews(setup: Readonly<Record<string, { status: string; reasons?: string[]; updatedAt?: string; origin?: string; tags?: string[] }>>): { state: CanonicalState; refs: RecordRef[] } {
  const base = loadFixtureState('maximal-valid');
  const records: Record<string, Record<string, AnyRecord>> = JSON.parse(JSON.stringify(base.records));
  const refs: RecordRef[] = [];
  for (const [path, change] of Object.entries(setup)) {
    const [kind, id] = path.split(':') as [string, string];
    const record = records[kind]?.[id] as Reviewed | undefined;
    if (record === undefined) throw new Error(`no ${path}`);
    record.review = { ...record.review, status: change.status, reasons: change.reasons ?? [] } as Reviewed['review'];
    delete (record.review as { reviewedAt?: string }).reviewedAt;
    if (change.updatedAt !== undefined) record.provenance = { ...record.provenance, updatedAt: change.updatedAt };
    if (change.origin !== undefined) record.provenance = { ...record.provenance, origin: change.origin as Reviewed['provenance']['origin'] };
    if (change.tags !== undefined) record.tags = change.tags;
    refs.push({ kind, id } as RecordRef);
  }
  return { state: { ...base, records } as unknown as CanonicalState, refs };
}

/** Make every record of the fixture verified except those named, so the queue holds exactly those. */
function onlyThese(setup: Parameters<typeof withReviews>[0]): { state: CanonicalState; refs: RecordRef[] } {
  const all = loadFixtureState('maximal-valid');
  const quiet: Record<string, { status: string }> = {};
  for (const [kind, byId] of Object.entries(all.records)) for (const [id, record] of Object.entries(byId as Record<string, AnyRecord>)) if ('review' in record) quiet[`${kind}:${id}`] = { status: 'verified' };
  const made = withReviews({ ...quiet, ...setup });
  return { state: made.state, refs: Object.keys(setup).map((path) => ({ kind: path.split(':')[0], id: path.split(':')[1] }) as RecordRef) };
}

const SPC = Object.keys(loadFixtureState('maximal-valid').records.species);
const RXN = Object.keys(loadFixtureState('maximal-valid').records.reaction);
const CLS = Object.keys(loadFixtureState('maximal-valid').records.class);
const s0 = `species:${SPC[0]}`;
const s1 = `species:${SPC[1]}`;
const r0 = `reaction:${RXN[0]}`;
const c0 = `class:${CLS[0]}`;

const findings = (table: Readonly<Record<string, readonly { severity: string; message: string }[]>>): FindingsOf => (reference) => (table[`${reference.kind}:${reference.id}`] ?? []) as ReturnType<FindingsOf>;
const NONE = findings({});
const ALL: QueueFilters = {};

describe('queueRows', () => {
  it('lists exactly the records whose status is not verified, with kind and status words, reasons and E / W counts', () => {
    const { state } = onlyThese({ [s0]: { status: 'review_required', reasons: ['Imported without a source'] }, [r0]: { status: 'unreviewed' } });
    const table = findings({
      [s0]: [
        { severity: 'error', message: 'Formula does not match' },
        { severity: 'warning', message: 'Charge looks odd' },
        { severity: 'warning', message: 'Second warning' },
        { severity: 'info', message: 'ignore me' },
        { severity: 'review_required', message: 'A person needs to check this record.' },
      ],
    });
    const rows = queueRows(state, table, ALL);
    expect(rows.map((row) => `${row.ref.kind}:${row.ref.id}`).sort()).toEqual([r0, s0].sort());
    const row = rows.find((one) => one.ref.id === SPC[0]);
    expect(row).toMatchObject({ statusWords: 'Needs review', reasons: ['Imported without a source'], errors: 1, warnings: 2, firstError: 'Formula does not match', firstWarning: 'Charge looks odd' });
    expect(rows.find((one) => one.ref.id === RXN[0])).toMatchObject({ statusWords: 'Not reviewed', errors: 0, warnings: 0 });
    expect(row?.kindWords).toBe('species');
    expect(rows.some((one) => one.ref.kind === 'navigator_anchor')).toBe(false); // layer 5 has no review
  });

  it('filters by kind, status, has errors, has warnings, origin and tag', () => {
    const { state } = onlyThese({
      [s0]: { status: 'review_required', origin: 'import', tags: ['jee'] },
      [s1]: { status: 'unreviewed', origin: 'user', tags: [] },
      [r0]: { status: 'unreviewed', origin: 'import', tags: ['jee', 'x'] },
    });
    const table = findings({ [s0]: [{ severity: 'error', message: 'e' }], [r0]: [{ severity: 'warning', message: 'w' }] });
    const ids = (filters: QueueFilters): string[] => queueRows(state, table, filters).map((row) => `${row.ref.kind}:${row.ref.id}`).sort();
    expect(ids({ kinds: ['species'] })).toEqual([s0, s1].sort());
    expect(ids({ statuses: ['review_required'] })).toEqual([s0]);
    expect(ids({ hasErrors: true })).toEqual([s0]);
    expect(ids({ hasWarnings: true })).toEqual([r0]);
    expect(ids({ origin: 'import' })).toEqual([r0, s0].sort());
    expect(ids({ tag: 'jee' })).toEqual([r0, s0].sort());
    expect(ids({ kinds: ['species'], origin: 'import', tag: 'jee' })).toEqual([s0]);
  });

  it('sorts errors first, then warnings, then the oldest update, and is stable', () => {
    const { state } = onlyThese({
      [s0]: { status: 'unreviewed', updatedAt: '2026-01-05T00:00:00.000Z' },
      [s1]: { status: 'unreviewed', updatedAt: '2026-01-01T00:00:00.000Z' },
      [r0]: { status: 'unreviewed', updatedAt: '2026-01-09T00:00:00.000Z' },
      [c0]: { status: 'unreviewed', updatedAt: '2026-01-03T00:00:00.000Z' },
    });
    const table = findings({
      [r0]: [{ severity: 'error', message: 'e' }],
      [c0]: [{ severity: 'warning', message: 'w' }],
    });
    const order = queueRows(state, table, ALL).map((row) => `${row.ref.kind}:${row.ref.id}`);
    expect(order).toEqual([r0, c0, s1, s0]);
    expect(queueRows(state, table, ALL).map((row) => row.ref.id)).toEqual(order.map((one) => one.split(':')[1]));
  });
});

describe('verifyPlan', () => {
  it('refuses a record with an ERROR (first error in words), lists warning records for the confirm, and the rest are ready', () => {
    const { state, refs } = onlyThese({ [s0]: { status: 'unreviewed' }, [s1]: { status: 'unreviewed' }, [r0]: { status: 'review_required', reasons: ['x'] } });
    const table = findings({
      [s0]: [{ severity: 'error', message: 'Broken one' }, { severity: 'error', message: 'Broken two' }],
      [s1]: [{ severity: 'warning', message: 'Look at this' }, { severity: 'warning', message: 'And this' }],
    });
    const plan = verifyPlan(state, refs, table);
    expect(plan.refused).toEqual([expect.objectContaining({ ref: ref('species', SPC[0] as string), message: 'Broken one' })]);
    expect(plan.warned).toEqual([expect.objectContaining({ ref: ref('species', SPC[1] as string), count: 2, first: 'Look at this' })]);
    expect(plan.ready.map((one) => one.id).sort()).toEqual([RXN[0], SPC[1]].sort());
    expect(plan.alreadyVerified).toEqual([]);
  });

  it('says which records are already verified instead of skipping them silently', () => {
    const { state } = withReviews({ [s0]: { status: 'verified' }, [s1]: { status: 'unreviewed' } });
    const plan = verifyPlan(state, [ref('species', SPC[0] as string), ref('species', SPC[1] as string)], NONE);
    expect(plan.alreadyVerified.map((one) => one.id)).toEqual([SPC[0]]);
    expect(plan.ready.map((one) => one.id)).toEqual([SPC[1]]);
  });
});

describe('markVerifiedEnvelope', () => {
  it('is ONE envelope "mark verified (n)": status verified, reviewedAt from the clock, reasons kept; one undo restores all', () => {
    const { state, refs } = onlyThese({ [s0]: { status: 'review_required', reasons: ['Check the source'] }, [r0]: { status: 'unreviewed' } });
    const store = makeStore(state);
    const built = markVerifiedEnvelope(store.getState(), refs, NONE, NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope.label).toBe('mark verified (2)');
    mustCommit(store.dispatch(built.envelope));
    const after = recordIn<Reviewed>(store.getState(), 'species', SPC[0] as string);
    expect(after.review).toMatchObject({ status: 'verified', reviewedAt: NOW, reasons: ['Check the source'] });
    expect(recordIn<Reviewed>(store.getState(), 'reaction', RXN[0] as string).review).toMatchObject({ status: 'verified', reviewedAt: NOW });
    expect(queueRows(store.getState(), NONE, ALL)).toEqual([]);
    store.undo();
    expect(recordIn<Reviewed>(store.getState(), 'species', SPC[0] as string).review.status).toBe('review_required');
    expect(recordIn<Reviewed>(store.getState(), 'reaction', RXN[0] as string).review.status).toBe('unreviewed');
    expect(queueRows(store.getState(), NONE, ALL)).toHaveLength(2);
  });

  it('refuses in words when any chosen record has an ERROR (nothing is built); with only the ready ones it builds', () => {
    const { state, refs } = onlyThese({ [s0]: { status: 'unreviewed' }, [s1]: { status: 'unreviewed' } });
    const table = findings({ [s0]: [{ severity: 'error', message: 'Broken' }] });
    const refused = markVerifiedEnvelope(state, refs, table, NOW);
    expect(refused).toEqual({ ok: false, message: expect.stringContaining('Broken') });
    const plan = verifyPlan(state, refs, table);
    const built = markVerifiedEnvelope(state, plan.ready, table, NOW);
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.envelope.label).toBe('mark verified (1)');
  });

  it('asks for nothing to do when no record is chosen', () => {
    const { state } = onlyThese({});
    expect(markVerifiedEnvelope(state, [], NONE, NOW)).toEqual({ ok: false, message: 'No record is chosen.' });
  });
});

describe('needsReviewEnvelope', () => {
  it('needs a reason (one line); status review_required and the reason is added to the reasons, once', () => {
    const { state, refs } = onlyThese({ [s0]: { status: 'unreviewed', reasons: ['Old reason'] }, [r0]: { status: 'verified' } });
    expect(needsReviewEnvelope(state, refs, '   ', NOW)).toEqual({ ok: false, message: 'Say why this needs review.' });
    expect(needsReviewEnvelope(state, refs, 'two\nlines', NOW)).toEqual({ ok: false, message: 'The reason is one line.' });
    const store = makeStore(state);
    const built = needsReviewEnvelope(store.getState(), refs, '  Source is missing  ', NOW);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.envelope.label).toBe('needs review (2)');
    mustCommit(store.dispatch(built.envelope));
    expect(recordIn<Reviewed>(store.getState(), 'species', SPC[0] as string).review).toMatchObject({ status: 'review_required', reasons: ['Old reason', 'Source is missing'] });
    expect(recordIn<Reviewed>(store.getState(), 'reaction', RXN[0] as string).review).toMatchObject({ status: 'review_required', reasons: ['Source is missing'] });
    store.undo();
    expect(recordIn<Reviewed>(store.getState(), 'reaction', RXN[0] as string).review.status).toBe('verified');
  });

  it('a record that already has 32 reasons is refused in words, not truncated', () => {
    const many = Array.from({ length: 32 }, (_, index) => `reason ${index}`);
    const { state, refs } = onlyThese({ [s0]: { status: 'unreviewed', reasons: many } });
    const answer = needsReviewEnvelope(state, refs, 'One more', NOW);
    expect(answer).toEqual({ ok: false, message: expect.stringContaining('already has 32 reasons') });
  });
});
