/**
 * Precomputed findings (Phase 4 contract decisions, Q3): the checks that decide whether findings produced elsewhere
 * belong to the state the store is about to adopt. Everything here is cheap and exact (linear in the findings plus
 * the record kinds); what it cannot prove (that no finding is missing) is what `verifyPrecomputed` recomputes in tests.
 * Pure: no state, no validation, no storage.
 */
import { RECORD_KINDS, type CanonicalState, type RecordKind } from '../schema';
import { RULE_SET_ID, RULE_SET_LEVELS } from '../validation/rule-set';
import type { Finding, Severity } from '../validation/contracts';
import type { CommandError, PrecomputedFindings } from './contracts';
import { jsonEqual, recordAt } from './lookup';

const SEVERITIES: ReadonlySet<string> = new Set<Severity>(['error', 'warning', 'info', 'review_required']);
const KINDS: ReadonlySet<string> = new Set(RECORD_KINDS);

const mismatch = (message: string): CommandError => ({ code: 'FINDINGS_MISMATCH', message: `Precomputed findings refused: ${message}` });
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Why `pre` cannot be the L1-L3 findings of `next` adopted at `revision`, or undefined. `next` has the shape of a state. */
export function checkPrecomputed(next: CanonicalState, revision: number, pre: PrecomputedFindings): CommandError | undefined {
  if (!isObject(pre) || !Array.isArray(pre.findings) || !isObject(pre.recordCounts)) return mismatch('the value is not { findings, ruleSet, revision, recordCounts }.');
  if (pre.ruleSet !== RULE_SET_ID) return mismatch(`rule set ${String(pre.ruleSet)} is not this build's rule set ${RULE_SET_ID}.`);
  if (pre.revision !== revision) return mismatch(`the findings are for revision ${String(pre.revision)}, but the store would adopt revision ${revision}.`);
  const counts = pre.recordCounts as Readonly<Record<string, unknown>>;
  for (const key of Object.keys(counts)) {
    if (!KINDS.has(key)) return mismatch(`record count for an unknown kind "${key}".`);
  }
  for (const kind of RECORD_KINDS) {
    const actual = Object.keys(next.records[kind]).length;
    if (counts[kind] !== actual) return mismatch(`record count for ${kind} is ${String(counts[kind])}, the new state has ${actual}.`);
  }
  const seen = new Set<string>();
  for (const finding of pre.findings as readonly unknown[]) {
    if (!isObject(finding) || typeof finding.id !== 'string' || typeof finding.ruleId !== 'string' || !isObject(finding.subject)) {
      return mismatch('a finding is malformed (id, ruleId and subject are required).');
    }
    if (typeof finding.severity !== 'string' || !SEVERITIES.has(finding.severity)) return mismatch(`finding ${finding.id} has an unknown severity.`);
    const { kind, id } = finding.subject as { kind?: unknown; id?: unknown };
    if (typeof kind !== 'string' || !KINDS.has(kind) || typeof id !== 'string' || recordAt(next, { kind: kind as RecordKind, id }) === undefined) {
      return mismatch(`finding ${finding.id} is about ${String(kind)}:${String(id)}, which is not in the new state.`);
    }
    if (finding.level !== 1 && finding.level !== 2 && finding.level !== 3) return mismatch(`finding ${finding.id} is level ${String(finding.level)}; only levels 1-3 are accepted (level 4 is never passed).`);
    const expected = RULE_SET_LEVELS.get(finding.ruleId);
    if (expected === undefined) return mismatch(`finding ${finding.id} is of rule ${finding.ruleId}, which is not in the rule set.`);
    if (expected !== finding.level) return mismatch(`finding ${finding.id} says rule ${finding.ruleId} is level ${finding.level}; the rule set says ${expected}.`);
    if (seen.has(finding.id)) return mismatch(`finding ID ${finding.id} appears more than once.`);
    seen.add(finding.id);
  }
  return undefined;
}

const byIdentity = (a: Finding, b: Finding): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.message < b.message ? -1 : a.message > b.message ? 1 : 0);

/** `verifyPrecomputed`: the precomputed findings must equal `computed` (`validateAll`), whatever their order. */
export function differsFrom(precomputed: readonly Finding[], computed: readonly Finding[]): CommandError | undefined {
  if (precomputed.length !== computed.length) return mismatch(`${precomputed.length} findings were passed, validateAll finds ${computed.length}.`);
  const left = [...precomputed].sort(byIdentity);
  const right = [...computed].sort(byIdentity);
  const at = left.findIndex((finding, i) => !jsonEqual(finding, right[i]));
  return at === -1 ? undefined : mismatch(`finding ${left[at]?.id ?? '?'} differs from validateAll's (${right[at]?.id ?? '?'}).`);
}
