/** RULE_SET_ID (step 4.2a, Phase 4 contract decisions Q3): computed from the sorted (rule ID, level) pairs, never hand-edited. */
import { describe, expect, it } from 'vitest';
import { L2_RULES, L3_RULES, RULES } from './rules/registry';
import { SCHEMA_RULE_ID } from './l1';
import { RULE_SET, RULE_SET_ID, RULE_SET_LEVELS, computeRuleSetId, type RuleIdentity } from './rule-set';

const identities = (): RuleIdentity[] => RULE_SET.map((rule) => ({ ...rule }));

describe('RULE_SET_ID', () => {
  it('is computed from the L1 schema rule and every registered L2 and L3 rule', () => {
    const expected: RuleIdentity[] = [{ id: SCHEMA_RULE_ID, level: 1 }, ...L2_RULES.map((r) => ({ id: r.id, level: r.level })), ...L3_RULES.map((r) => ({ id: r.id, level: r.level }))];
    expect(RULES.length).toBe(L2_RULES.length + L3_RULES.length);
    expect(RULE_SET_ID).toBe(computeRuleSetId(expected));
    expect(RULE_SET_ID).toMatch(/^rs_[0-9a-f]{16}$/);
    expect(RULE_SET_LEVELS.size).toBe(RULES.length + 1);
    for (const rule of RULES) expect(RULE_SET_LEVELS.get(rule.id)).toBe(rule.level);
    expect(RULE_SET_LEVELS.get(SCHEMA_RULE_ID)).toBe(1);
  });

  it('is deterministic', () => {
    expect(computeRuleSetId(identities())).toBe(RULE_SET_ID);
    expect(computeRuleSetId(identities())).toBe(computeRuleSetId(identities()));
  });

  it('does not depend on the order of the rules', () => {
    const reversed = identities().reverse();
    const rotated = [...identities().slice(7), ...identities().slice(0, 7)];
    expect(computeRuleSetId(reversed)).toBe(RULE_SET_ID);
    expect(computeRuleSetId(rotated)).toBe(RULE_SET_ID);
  });

  it('changes when a rule is added', () => {
    expect(computeRuleSetId([...identities(), { id: 'XXX-999', level: 3 }])).not.toBe(RULE_SET_ID);
  });

  it('changes when a rule is removed', () => {
    for (const drop of [0, 1, RULE_SET.length - 1]) {
      expect(computeRuleSetId(identities().filter((_, i) => i !== drop))).not.toBe(RULE_SET_ID);
    }
  });

  it('changes when a level changes', () => {
    const flipped = identities().map((rule, i) => (i === 2 ? { ...rule, level: rule.level === 3 ? (2 as const) : (3 as const) } : rule));
    expect(computeRuleSetId(flipped)).not.toBe(RULE_SET_ID);
  });

  it('changes when a rule is renamed, and does not confuse an ID with its level', () => {
    const renamed = identities().map((rule, i) => (i === 3 ? { ...rule, id: `${rule.id}x` } : rule));
    expect(computeRuleSetId(renamed)).not.toBe(RULE_SET_ID);
    expect(computeRuleSetId([{ id: 'A1', level: 2 }])).not.toBe(computeRuleSetId([{ id: 'A', level: 12 as never }]));
  });
});
