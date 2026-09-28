/**
 * Field-aware scoping for `scopeOf` (ADR-031, step 2.12; per-rule since ADR-032, step 2.13). A referrer of a
 * touched record is re-validated only if some rule of the referrer's kind may read what changed: a rule without `referencedReads` may read
 * anything, a rule with it reads the fields it names (and, for any kind it names, whether the record exists).
 * Only the referrer expansion is narrowed; referents and `peers` are unchanged.
 */
import type { AnyRecord, RecordKind } from '../schema';
import type { ReferencedReads, ValidationRule } from './contracts';

/** The top-level fields that differ between two versions of a record, or `'all'` when that is not knowable. */
export type Change = 'all' | ReadonlySet<string>;

/**
 * `hasPrevious` is false when the caller gave no previous state: nothing can be diffed. A record that is
 * created or deleted changes every field. Fields compare by reference, which is exact under structural
 * sharing: a different value is never `===`, and an equal one that was rebuilt only widens the change.
 */
export function changeOf(current: AnyRecord | undefined, previous: AnyRecord | undefined, hasPrevious: boolean): Change {
  if (!hasPrevious || current === undefined || previous === undefined) return 'all';
  const now = current as unknown as Readonly<Record<string, unknown>>;
  const before = previous as unknown as Readonly<Record<string, unknown>>;
  const changed = new Set<string>();
  for (const key of new Set([...Object.keys(now), ...Object.keys(before)])) {
    if (now[key] !== before[key]) changed.add(key);
  }
  return changed;
}

/** Does a rule that declares `reads` for records of kind `touched` read anything that `change` altered? */
export function readsField(reads: ReferencedReads | undefined, touched: RecordKind, change: Change): boolean {
  if (reads === undefined) return true;
  const own = reads[touched];
  const any = reads['*'];
  if (own === undefined && any === undefined) return false;
  if (change === 'all') return true;
  return [...(own ?? []), ...(any ?? [])].some((field) => change.has(field));
}

/** Does `rule`, validating a referrer, read anything of a `touched` record that `change` altered? */
export function readsChange(rule: ValidationRule, touched: RecordKind, change: Change): boolean {
  return readsField(rule.referencedReads, touched, change);
}

/** Rules that can run on a record of each kind, at levels 2 and 3 (level 1 reads only the record). */
export function rulesByKind(rules: readonly ValidationRule[]): ReadonlyMap<RecordKind, readonly ValidationRule[]> {
  const map = new Map<RecordKind, ValidationRule[]>();
  for (const rule of rules) {
    for (const kind of rule.kinds) map.set(kind, [...(map.get(kind) ?? []), rule]);
  }
  return map;
}

/**
 * For one touched record: which rules of a referrer of `referrerKind` read what changed? Computed once per
 * referrer kind, so a hub with a thousand referrers costs one rule scan, not a thousand. An empty answer means
 * the referrer needs nothing; an answer with an L2 rule means it is re-validated whole (an L2 outcome can gate
 * its L3 rules); otherwise only the listed L3 rules are re-run (ADR-032).
 */
export function referrerRules(
  rulesOf: ReadonlyMap<RecordKind, readonly ValidationRule[]>,
  touched: RecordKind,
  change: Change,
): (referrerKind: RecordKind) => readonly ValidationRule[] {
  const answers = new Map<RecordKind, readonly ValidationRule[]>();
  return (referrerKind) => {
    let answer = answers.get(referrerKind);
    if (answer === undefined) {
      answer = (rulesOf.get(referrerKind) ?? []).filter((rule) => readsChange(rule, touched, change));
      answers.set(referrerKind, answer);
    }
    return answer;
  };
}

/** Does any rule of a referrer of `referrerKind` read what changed (ADR-031)? */
export function referrerFilter(
  rulesOf: ReadonlyMap<RecordKind, readonly ValidationRule[]>,
  touched: RecordKind,
  change: Change,
): (referrerKind: RecordKind) => boolean {
  const rules = referrerRules(rulesOf, touched, change);
  return (referrerKind) => rules(referrerKind).length > 0;
}
