import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '../indexes/engine';
import type { AnyRecord } from '../schema';
import { loadFixtureState, must } from '../../test-support/state-fixture';
import { duplicateRecordFindings } from './l2';
import type { FindingDraft, ValidationRule } from './contracts';
import { assertUniqueRuleIds, runRules } from './runner';
import { RULES } from './rules/registry';

const state = loadFixtureState('minimal-valid');
const ctx = { state, indexes: coreIndexEngine.build(state) };
const species = must(Object.values(state.records.species)[0]) as AnyRecord;

const rule = (id: string, kinds: ValidationRule['kinds'], drafts: FindingDraft[], level: 2 | 3 = 3): ValidationRule => ({
  id,
  level,
  kinds,
  defaultSeverity: 'warning',
  scope: 'record',
  description: id,
  check: () => drafts,
});

describe('runRules', () => {
  it('runs only rules for the record kind, stamps subject, level and severity, and sorts by rule then path', () => {
    const rules = [
      rule('Z-1', ['species'], [{ message: 'z' }]),
      rule('A-1', ['species'], [{ path: 'b', message: 'b' }, { path: 'a', message: 'a', severity: 'info' }]),
      rule('R-1', ['reaction'], [{ message: 'never' }]),
    ];
    const found = runRules(rules, species, ctx);
    expect(found.map((f) => [f.ruleId, f.path, f.severity])).toEqual([
      ['A-1', 'a', 'info'],
      ['A-1', 'b', 'warning'],
      ['Z-1', undefined, 'warning'],
    ]);
    expect(found.every((f) => f.subject.id === species.id && f.level === 3)).toBe(true);
  });

  it('refuses a rule that reports one (rule, path) twice: two findings would share an ID', () => {
    const rules = [rule('DUP-1', ['species'], [{ path: 'p', message: 'one' }, { path: 'p', message: 'two' }])];
    expect(() => runRules(rules, species, ctx)).toThrow(/DUP-1.*twice/);
  });

  it('returns nothing when no rule applies', () => {
    expect(runRules([], species, ctx)).toEqual([]);
  });
});

describe('assertUniqueRuleIds', () => {
  it('accepts the registry and rejects a repeated ID', () => {
    expect(() => assertUniqueRuleIds(RULES)).not.toThrow();
    expect(() => assertUniqueRuleIds([rule('X', ['species'], []), rule('X', ['class'], [])])).toThrow(/Duplicate/);
  });
});

describe('duplicateRecordFindings (REF-006 for a record ID listed twice)', () => {
  it('reports each duplicate as a level-2 error on the record, at path id', () => {
    const found = duplicateRecordFindings([{ kind: 'species', id: 'spc_x' }, { kind: 'class', id: 'cls_y' }]);
    expect(found.map((f) => [f.ruleId, f.level, f.severity, f.path, f.subject.id])).toEqual([
      ['REF-006', 2, 'error', 'id', 'spc_x'],
      ['REF-006', 2, 'error', 'id', 'cls_y'],
    ]);
    expect(new Set(found.map((f) => f.id)).size).toBe(2);
    expect(duplicateRecordFindings([])).toEqual([]);
  });
});
