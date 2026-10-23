/**
 * No raw schema (zod) text reaches the findings panel (step 6.8 follow-up U6): a required choice not made reads "Choose <field words>
 * for <place in words>", any other schema message "<Field words> is not valid (<place>)". The schema's own plain words are kept.
 */
import { describe, expect, it } from 'vitest';
import { RECORD_ID_PREFIX, RECORD_KINDS } from '../schema';
import type { Finding } from '../validation';
import { parseRecord } from '../validation/l1';
import { blankDraft } from './blank';
import { findingWords, isSchemaWording } from './schema-words';

const finding = (message: string, path?: string, ruleId = 'SCHEMA'): Finding =>
  ({ id: 'fnd_x', ruleId, level: 1, severity: 'error', subject: { kind: 'reaction', id: 'rxn_x' }, ...(path === undefined ? {} : { path }), message, related: [] }) as Finding;
const OPTION = 'Invalid option: expected one of "main"|"coproduct"|"byproduct"';

describe('findingWords', () => {
  it('a required choice not made: "Choose a role for product 1 of outcome 1"', () => {
    expect(findingWords(finding(OPTION, 'outcomes[0].products[0].role'))).toBe('Choose a role for product 1 of outcome 1');
  });
  it('a choice at the top of the record has no place: "Choose a scope"', () => {
    expect(findingWords(finding('Invalid option: expected one of "generic"|"specific"', 'scope'))).toBe('Choose a scope');
  });
  it('an "an" before a vowel and camelCase field names in words', () => {
    expect(findingWords(finding(OPTION, 'stages[1].kind'))).toBe('Choose a kind for stage 2');
    expect(findingWords(finding(OPTION, 'assetRole'))).toBe('Choose an asset role');
    expect(findingWords(finding(OPTION, 'conditionVariants[0].stageId'))).toBe('Choose a stage id for condition variant 1');
  });
  it('any other schema message: "<Field words> is not valid (<place>)"', () => {
    expect(findingWords(finding('Invalid input: expected number, received undefined', 'participants[2].coefficient'))).toBe('Coefficient is not valid (participant 3)');
    expect(findingWords(finding('Invalid input: expected object, received undefined', 'from'))).toBe('From is not valid');
    expect(findingWords(finding('Too small: expected number to be >0', 'outcomes[0].products[1].coefficient'))).toBe('Coefficient is not valid (product 2 of outcome 1)');
  });
  it('the schema plain words and other rules are kept as they are', () => {
    expect(findingWords(finding('Must not be blank', 'name'))).toBe('Must not be blank');
    expect(findingWords(finding('Unknown field "x": not part of the schema, so it cannot be stored', ''))).toContain('Unknown field');
    expect(findingWords(finding(OPTION, 'x', 'RXN-004'))).toBe(OPTION);
  });
  it('when a finding has words of its own, the library phrase beside them is dropped', () => {
    expect(findingWords(finding('Choose a species of Primary alcohol (participant 2); Invalid input: expected string, received undefined', 'participants[1]'))).toBe('Choose a species of Primary alcohol (participant 2)');
  });
  it('isSchemaWording recognises the library phrases only', () => {
    for (const text of [OPTION, 'Invalid input: expected string, received undefined', 'Too big: expected string to have <=120 characters', 'Invalid string: must match pattern /x/']) expect(isSchemaWording(text)).toBe(true);
    for (const text of ['Must not be blank', 'Choose a kind', 'Unknown field "a"']) expect(isSchemaWording(text)).toBe(false);
  });
});

describe('every blank draft', () => {
  it('no finding of any kind blank draft carries schema wording after findingWords', () => {
    const ctx = { now: () => '2026-10-23T00:00:00.000Z', newId: (prefix: string) => `${prefix}_probe` } as never;
    let checked = 0;
    for (const kind of RECORD_KINDS) {
      const draft = blankDraft(kind, ctx) ?? { kind, id: `${RECORD_ID_PREFIX[kind]}_probe` };
      const parsed = parseRecord(kind, draft);
      if (parsed.ok) continue;
      for (const one of parsed.findings) {
        const words = findingWords(one);
        checked += 1;
        expect(isSchemaWording(words), `${kind} ${one.path ?? ''}: ${words}`).toBe(false);
        expect(words).not.toMatch(/\b(zod|expected|received|undefined)\b/i);
      }
    }
    expect(checked).toBeGreaterThan(40);
  });
});
