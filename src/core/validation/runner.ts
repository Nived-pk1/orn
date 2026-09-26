/**
 * Runs registered rules over one record. Rules are pure functions of (record, context); this runner
 * only routes by kind, stamps findings and refuses ambiguous output. Deciding *which* records to run
 * (touched, dependents, all) is the validator's job (step 1.8).
 */
import type { AnyRecord, RecordRef } from '../schema';
import type { Finding, RuleContext, ValidationRule } from './contracts';
import { makeFinding, ruleOrigin } from './findings';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Programmer error: two rules share an ID, so findings and tests could not tell them apart. */
export function assertUniqueRuleIds(rules: readonly ValidationRule[]): void {
  const seen = new Set<string>();
  for (const rule of rules) {
    if (seen.has(rule.id)) throw new Error(`Duplicate validation rule ID ${rule.id}`);
    seen.add(rule.id);
  }
}

/**
 * Findings of every applicable rule for `record`, sorted by rule then path. A rule that reports two
 * problems at the same (rule, path) would give both the same finding ID; that is a rule bug and throws.
 */
export function runRules(rules: readonly ValidationRule[], record: AnyRecord, ctx: RuleContext): readonly Finding[] {
  const subject: RecordRef = { kind: record.kind, id: record.id };
  const found = new Map<string, Finding>();
  for (const rule of rules) {
    if (!(rule.kinds as readonly string[]).includes(record.kind)) continue;
    for (const draft of rule.check(record, ctx)) {
      const finding = makeFinding(ruleOrigin(rule), subject, draft);
      if (found.has(finding.id)) {
        throw new Error(`Rule ${rule.id} reported ${finding.path ?? '(record)'} of ${subject.id} twice`);
      }
      found.set(finding.id, finding);
    }
  }
  return [...found.values()].sort((a, b) => compare(a.ruleId, b.ruleId) || compare(a.path ?? '', b.path ?? ''));
}
