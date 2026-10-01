/**
 * The L4 catalogue: the same nine rules the core registry lists as external, the severities of docs/VALIDATION_RULES.md §3, and no
 * part in the L1-L3 rule-set identity. `toFinding` builds level-4 findings with core's stable ID hash.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findingId, EXTERNAL_RULES, RULE_SET, RULE_SET_ID, computeRuleSetId } from '@/core/validation';
import { L4_RULES, L4_RULE_IDS, toFinding } from './rules';

const ref = { kind: 'species', id: 'spc_x' } as const;

describe('L4_RULES', () => {
  it('matches the L4 entries of the core rule registry (EXTERNAL_RULES), ID for ID', () => {
    const external = Object.keys(EXTERNAL_RULES).filter((id) => id.startsWith('CHEM-')).sort();
    expect([...L4_RULE_IDS].sort()).toEqual(external);
    expect(external).toHaveLength(9);
    for (const id of external) expect(EXTERNAL_RULES[id]).toMatch(/L4, chem worker/);
  });

  it('has the default severities of VALIDATION_RULES.md §3 and a description that starts the same', () => {
    const doc = readFileSync('docs/VALIDATION_RULES.md', 'utf8');
    for (const rule of L4_RULES) {
      const row = doc.split('\n').find((line) => line.startsWith(`| ${rule.id} |`));
      expect(row, rule.id).toBeDefined();
      const severity = (row as string).split('|').map((cell) => cell.trim()).at(-2);
      expect(severity?.toLowerCase(), rule.id).toBe(rule.defaultSeverity);
      const text = (row as string).split('|')[2]?.trim() ?? '';
      expect(text.slice(0, 20), rule.id).toBe(rule.description.slice(0, 20));
    }
  });

  it('owns every rule once; CHEM-009 is the service\'s, the rest the worker\'s; every rule is built', () => {
    expect(new Set(L4_RULE_IDS).size).toBe(L4_RULES.length);
    expect(L4_RULES.filter((rule) => rule.owner === 'service').map((rule) => rule.id)).toEqual(['CHEM-009']);
    expect(L4_RULES.filter((rule) => !rule.implemented).map((rule) => `${rule.id}: ${rule.reason ?? 'no reason given'}`)).toEqual([]);
  });

  it('L4 rule IDs are not part of RULE_SET_ID (L1-L3 only)', () => {
    expect(RULE_SET.some((rule) => rule.id.startsWith('CHEM-'))).toBe(false);
    expect(RULE_SET.some((rule) => rule.level === 4)).toBe(false);
    expect(computeRuleSetId([...RULE_SET, ...L4_RULES.map((rule) => ({ id: rule.id, level: 4 as const }))])).not.toBe(RULE_SET_ID);
  });
});

describe('toFinding', () => {
  it('builds a level-4 finding with the rule\'s default severity and core\'s stable ID (a hash of rule, subject and path only)', () => {
    const a = toFinding('CHEM-001', ref, { path: 'structure', message: 'one' });
    const b = toFinding('CHEM-001', ref, { path: 'structure', message: 'a different text' });
    expect(a).toMatchObject({ ruleId: 'CHEM-001', level: 4, severity: 'warning', subject: ref, path: 'structure' });
    expect(a.id).toBe(findingId('CHEM-001', ref, 'structure'));
    expect(b.id).toBe(a.id);
    expect(toFinding('CHEM-005', ref, { path: 'outcomes[0]', message: 'x' }).severity).toBe('info');
    expect(toFinding('CHEM-001', { kind: 'species', id: 'spc_y' }, { path: 'structure', message: 'x' }).id).not.toBe(a.id);
  });

  it('an unknown rule is a programmer error', () => {
    expect(() => toFinding('CHEM-042', ref, { message: 'x' })).toThrow(RangeError);
  });
});
