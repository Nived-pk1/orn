/**
 * Condition text of a quick-entry stage through the EXISTING condition parser (step 6.7b, Q2): recognised pieces become schema fields listed in
 * `parsedFields` (they need Confirm, RXN-015); everything else stays in the stage's text, and is said. Nothing is guessed.
 */
import { describe, expect, it } from 'vitest';
import { ConditionParametersSchema } from '../schema';
import { conditionsFromText } from './conditions';

describe('conditionsFromText', () => {
  it('an empty text gives empty parameters and nothing recognised', () => {
    const made = conditionsFromText('  ');
    expect(made.parameters).toMatchObject({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
    expect(made.parameters.text).toBeUndefined();
    expect(made.recognised).toEqual([]);
    expect(made.unrecognised).toEqual([]);
  });
  it('recognised pieces fill fields and are listed in parsedFields; the whole text is kept', () => {
    const made = conditionsFromText('aqueous, 0 °C, acidic, nitrogen, 2 atm');
    expect(made.parameters.temperature).toMatchObject({ kind: 'value' });
    expect(made.parameters.medium).toBe('acidic');
    expect(made.parameters.atmosphere).toBe('nitrogen');
    expect(made.parameters.solventCharacter).toEqual(['aqueous']);
    expect(made.parameters.pressure).toMatchObject({ kind: 'value', value: 2, unit: 'atm' });
    expect(made.parameters.text).toBe('aqueous, 0 °C, acidic, nitrogen, 2 atm');
    expect([...made.parameters.parsedFields].sort()).toEqual(['atmosphere', 'medium', 'pressure', 'solventCharacter', 'temperature']);
    expect(made.recognised.map((r) => r.field).sort()).toEqual(['atmosphere', 'medium', 'phase', 'pressure', 'temperature']);
    expect(ConditionParametersSchema.safeParse(made.parameters).success).toBe(true);
  });
  it('a piece the parser does not know (a solvent name) stays in the text and is listed as not recognised: no field, nothing to confirm', () => {
    const made = conditionsFromText('CH2Cl2');
    expect(made.parameters.parsedFields).toEqual([]);
    expect(made.parameters.text).toBe('CH2Cl2');
    expect(made.unrecognised).toEqual(['CH2Cl2']);
    const mixed = conditionsFromText('CH2Cl2, rt');
    expect(mixed.unrecognised).toEqual(['CH2Cl2']);
    expect(mixed.parameters.temperature).toEqual({ kind: 'qualitative', value: 'room_temperature' });
    expect(mixed.parameters.parsedFields).toEqual(['temperature']);
  });
  it('a second piece for a field already filled is not recognised (never overwritten or merged)', () => {
    const made = conditionsFromText('0 °C, 25 °C');
    expect(made.recognised).toHaveLength(1);
    expect(made.unrecognised).toEqual(['25 °C']);
  });
  it('commas inside brackets do not split, and semicolons do', () => {
    expect(conditionsFromText('rt; aqueous').recognised).toHaveLength(2);
    expect(conditionsFromText('(a, b), rt').unrecognised).toEqual(['(a, b)']);
  });
  it('is total: odd text never throws and the parameters stay valid', () => {
    for (const text of ['', ',', ';;', '\u0000', '😀'.repeat(50), 'x'.repeat(5000), '0 °C 25 °C', 'under  N2 ']) {
      const made = conditionsFromText(text);
      expect(ConditionParametersSchema.safeParse(made.parameters).success).toBe(true);
    }
  });
});
