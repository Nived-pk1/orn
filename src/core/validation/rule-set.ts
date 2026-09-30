/**
 * The identity of the L1-L3 rule set (Phase 4 contract decisions, Q3). A findings producer in another thread (the
 * compute worker) stamps its findings with `RULE_SET_ID`; the store refuses findings stamped with another one, so a
 * worker built from a different rule set can never feed the store. Computed, never hand-edited: it hashes the
 * sorted (rule ID, level) pairs of every rule that can appear on an L1-L3 finding.
 */
import { hashParts } from '../hash';
import type { ValidationLevel } from './contracts';
import { SCHEMA_RULE_ID } from './l1';
import { RULES } from './rules/registry';

export interface RuleIdentity {
  readonly id: string;
  readonly level: ValidationLevel;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `rs_` + hash of the sorted (ID, level) pairs. The order of `rules` does not matter; the severity does not either. */
export function computeRuleSetId(rules: readonly RuleIdentity[]): string {
  const parts = rules.map((rule) => `${rule.id}\u0000${rule.level}`).sort(compare);
  return `rs_${hashParts(parts)}`;
}

/** Every rule that can appear on an L1-L3 finding: the L1 schema rule and the registered L2 and L3 rules. */
export const RULE_SET: readonly RuleIdentity[] = Object.freeze([
  { id: SCHEMA_RULE_ID, level: 1 as const },
  ...RULES.map((rule) => ({ id: rule.id, level: rule.level })),
]);

/** Rule ID → its level, for checking a finding that arrives from outside. */
export const RULE_SET_LEVELS: ReadonlyMap<string, ValidationLevel> = new Map(RULE_SET.map((rule) => [rule.id, rule.level] as const));

export const RULE_SET_ID: string = computeRuleSetId(RULE_SET);
