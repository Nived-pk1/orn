/**
 * The review queue (ADR-040 addendum, step 6.8b, R1). Pure: the records whose review status is not "verified" with their finding counts,
 * filtered and sorted (errors first, then warnings, then the oldest update), and the two bulk actions as ONE envelope each.
 * "Mark verified" is REFUSED for a record with any ERROR finding (its first error, in words); a record with WARNINGs is listed for a
 * confirm step by the caller; `reviewedAt` comes from the injected clock and the reasons are kept. "Needs review" needs a one-line reason
 * that is added to the reasons. Nothing here verifies anything by itself: every change is an action a person chose.
 */
import type { CommandEnvelope, DomainCommand } from '../commands/contracts';
import { allRefs, recordAt, refKey } from '../commands/lookup';
import { LIMITS } from '../schema';
import type { AnyRecord, CanonicalState, ORIGINS, RecordKind, RecordRef } from '../schema';
import { nameOfRef } from './labels';

export type ReviewStatus = 'unreviewed' | 'review_required' | 'verified';
export type Origin = (typeof ORIGINS)[number];

/** What the queue reads of a finding. */
export interface QueueFinding {
  readonly severity: string;
  readonly message: string;
}
/** The findings of one record (all levels); the app passes the finding store's `bySubject`. */
export type FindingsOf = (ref: RecordRef) => readonly QueueFinding[];

export const STATUS_WORDS: Readonly<Record<ReviewStatus, string>> = { unreviewed: 'Not reviewed', review_required: 'Needs review', verified: 'Verified' };
const KIND_WORDS: Readonly<Record<string, string>> = { reference: 'source', navigator_anchor: 'map family' };
export const kindWordsOf = (kind: string): string => KIND_WORDS[kind] ?? kind.replace(/_/g, ' ');

export interface QueueRow {
  readonly ref: RecordRef;
  readonly name: string;
  readonly kindWords: string;
  readonly status: ReviewStatus;
  readonly statusWords: string;
  readonly reasons: readonly string[];
  readonly errors: number;
  readonly warnings: number;
  readonly firstError: string | undefined;
  readonly firstWarning: string | undefined;
  readonly origin: Origin;
  /** The import that wrote this record (7.3b A1); absent for a record made here or imported before the id was kept. */
  readonly importBatchId?: string;
  readonly tags: readonly string[];
  readonly updatedAt: string;
}

export interface QueueFilters {
  readonly kinds?: readonly RecordKind[];
  readonly statuses?: readonly ReviewStatus[];
  readonly hasErrors?: boolean;
  readonly hasWarnings?: boolean;
  readonly origin?: Origin;
  readonly tag?: string;
}

interface Reviewed {
  readonly review: { readonly lifecycle: string; readonly status: ReviewStatus; readonly reasons: readonly string[]; readonly reviewedAt?: string };
  readonly provenance: { readonly origin: Origin; readonly updatedAt: string; readonly importBatchId?: string };
  readonly tags?: readonly string[];
}
const reviewed = (record: AnyRecord | undefined): (AnyRecord & Reviewed) | undefined => (record !== undefined && 'review' in record ? (record as AnyRecord & Reviewed) : undefined);

function rowOf(state: CanonicalState, record: AnyRecord & Reviewed, findings: FindingsOf): QueueRow {
  const ref = { kind: record.kind, id: record.id } as RecordRef;
  const all = findings(ref);
  const errors = all.filter((one) => one.severity === 'error');
  const warnings = all.filter((one) => one.severity === 'warning');
  return {
    ref,
    name: nameOfRef(state, ref),
    kindWords: kindWordsOf(record.kind),
    status: record.review.status,
    statusWords: STATUS_WORDS[record.review.status],
    reasons: record.review.reasons,
    errors: errors.length,
    warnings: warnings.length,
    firstError: errors[0]?.message,
    firstWarning: warnings[0]?.message,
    origin: record.provenance.origin,
    ...(record.provenance.importBatchId === undefined ? {} : { importBatchId: record.provenance.importBatchId }),
    tags: record.tags ?? [],
    updatedAt: record.provenance.updatedAt,
  };
}

/** Errors first (more first), then warnings, then the oldest update, then kind and ID so the order is the same every time. */
const byUrgency = (a: QueueRow, b: QueueRow): number =>
  b.errors - a.errors || b.warnings - a.warnings || (a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0) || (refKey(a.ref) < refKey(b.ref) ? -1 : 1);

export function queueRows(state: CanonicalState, findings: FindingsOf, filters: QueueFilters): readonly QueueRow[] {
  const rows: QueueRow[] = [];
  for (const ref of allRefs(state)) {
    const record = reviewed(recordAt(state, ref));
    if (record === undefined || record.review.status === 'verified') continue;
    if (filters.kinds !== undefined && filters.kinds.length > 0 && !filters.kinds.includes(record.kind)) continue;
    if (filters.statuses !== undefined && filters.statuses.length > 0 && !filters.statuses.includes(record.review.status)) continue;
    if (filters.origin !== undefined && record.provenance.origin !== filters.origin) continue;
    if (filters.tag !== undefined && !(record.tags ?? []).includes(filters.tag)) continue;
    const row = rowOf(state, record, findings);
    if (filters.hasErrors === true && row.errors === 0) continue;
    if (filters.hasWarnings === true && row.warnings === 0) continue;
    rows.push(row);
  }
  return rows.sort(byUrgency);
}

export interface VerifyPlan {
  /** Records with an ERROR finding: not verified, each with its first error. */
  readonly refused: readonly { readonly ref: RecordRef; readonly name: string; readonly message: string }[];
  /** Records with WARNINGs that would be verified after the confirm: the count and the first warning. */
  readonly warned: readonly { readonly ref: RecordRef; readonly name: string; readonly count: number; readonly first: string }[];
  /** Records that can be verified now (warned ones included). */
  readonly ready: readonly RecordRef[];
  readonly alreadyVerified: readonly RecordRef[];
}

export function verifyPlan(state: CanonicalState, refs: readonly RecordRef[], findings: FindingsOf): VerifyPlan {
  const refused: VerifyPlan['refused'][number][] = [];
  const warned: VerifyPlan['warned'][number][] = [];
  const ready: RecordRef[] = [];
  const alreadyVerified: RecordRef[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    const record = reviewed(recordAt(state, ref));
    if (record === undefined) continue;
    if (record.review.status === 'verified') {
      alreadyVerified.push(ref);
      continue;
    }
    const all = findings(ref);
    const errors = all.filter((one) => one.severity === 'error');
    if (errors.length > 0) {
      refused.push({ ref, name: nameOfRef(state, ref), message: errors[0]?.message ?? 'This record has an error.' });
      continue;
    }
    const warnings = all.filter((one) => one.severity === 'warning');
    if (warnings.length > 0) warned.push({ ref, name: nameOfRef(state, ref), count: warnings.length, first: warnings[0]?.message ?? '' });
    ready.push(ref);
  }
  return { refused, warned, ready, alreadyVerified };
}

type Built = { readonly ok: true; readonly envelope: CommandEnvelope } | { readonly ok: false; readonly message: string };

function updates(state: CanonicalState, refs: readonly RecordRef[], change: (record: AnyRecord & Reviewed) => AnyRecord | string): { readonly commands: DomainCommand[] } | { readonly message: string } {
  const commands: DomainCommand[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(refKey(ref))) continue;
    seen.add(refKey(ref));
    const record = reviewed(recordAt(state, ref));
    if (record === undefined) return { message: `${nameOfRef(state, ref)} is no longer there or has no review.` };
    const next = change(record);
    if (typeof next === 'string') return { message: next };
    commands.push({ type: 'record.update', record: next });
  }
  return { commands };
}

const touched = (record: AnyRecord & Reviewed, review: Reviewed['review'], now: string): AnyRecord => ({ ...record, review, provenance: { ...record.provenance, updatedAt: now } }) as AnyRecord;

/** Mark verified: ONE envelope. Refuses in words when any chosen record has an ERROR; the caller lists the plan first and passes `plan.ready`. */
export function markVerifiedEnvelope(state: CanonicalState, refs: readonly RecordRef[], findings: FindingsOf, now: string): Built {
  if (refs.length === 0) return { ok: false, message: 'No record is chosen.' };
  const plan = verifyPlan(state, refs, findings);
  const first = plan.refused[0];
  if (first !== undefined) return { ok: false, message: `${first.name} has an error and cannot be marked verified: ${first.message}` };
  if (plan.ready.length === 0) return { ok: false, message: 'Every chosen record is already verified.' };
  const built = updates(state, plan.ready, (record) => touched(record, { ...record.review, status: 'verified', reviewedAt: now }, now));
  if ('message' in built) return { ok: false, message: built.message };
  return { ok: true, envelope: { label: `mark verified (${built.commands.length})`, commands: built.commands } };
}

/** Needs review: ONE envelope; `reason` (one line, required) is added to the reasons of each record, once. */
export function needsReviewEnvelope(state: CanonicalState, refs: readonly RecordRef[], reason: string, now: string): Built {
  const text = reason.trim();
  if (refs.length === 0) return { ok: false, message: 'No record is chosen.' };
  if (text === '') return { ok: false, message: 'Say why this needs review.' };
  if (/[\r\n]/.test(text)) return { ok: false, message: 'The reason is one line.' };
  if (text.length > LIMITS.shortText) return { ok: false, message: `The reason is too long (at most ${LIMITS.shortText} characters).` };
  const built = updates(state, refs, (record) => {
    const has = record.review.reasons.includes(text);
    if (!has && record.review.reasons.length >= LIMITS.reviewReasons) return `${nameOfRef(state, { kind: record.kind, id: record.id } as RecordRef)} already has ${LIMITS.reviewReasons} reasons: remove one in its editor first.`;
    return touched(record, { ...record.review, status: 'review_required', reasons: has ? record.review.reasons : [...record.review.reasons, text] }, now);
  });
  if ('message' in built) return { ok: false, message: built.message };
  return { ok: true, envelope: { label: `needs review (${built.commands.length})`, commands: built.commands } };
}
