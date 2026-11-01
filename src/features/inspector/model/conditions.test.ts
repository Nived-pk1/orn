import { describe, expect, it } from 'vitest';
import type { ConditionParameters } from '@/core/schema';
import { parameterPhrases } from './conditions';

const base: ConditionParameters = { solventCharacter: [], activation: [], other: [], parsedFields: [] };
const of = (over: Partial<ConditionParameters>): string[] => parameterPhrases({ ...base, ...over });

describe('parameterPhrases reads as English (7.4 A4)', () => {
  it('a qualitative temperature is the word alone', () => {
    expect(of({ temperature: { kind: 'qualitative', value: 'cold' } })).toEqual(['cold']);
    expect(of({ temperature: { kind: 'qualitative', value: 'room_temperature' } })).toEqual(['room temperature']);
    expect(of({ temperature: { kind: 'qualitative', value: 'strong_heat' } })).toEqual(['strong heat']);
  });
  it('a temperature value or range keeps its number and unit; Celsius is written with the degree sign', () => {
    expect(of({ temperature: { kind: 'value', value: 80, unit: 'C' } })).toEqual(['80 °C']);
    expect(of({ temperature: { kind: 'range', min: 0, max: 5, unit: 'C' } })).toEqual(['0–5 °C']);
    expect(of({ temperature: { kind: 'value', value: 413, unit: 'K' } })).toEqual(['413 K']);
    expect(of({ temperature: { kind: 'range', min: 300, max: 310, unit: 'K' } })).toEqual(['300–310 K']);
  });
  it('the solvent character is "<value> solvent"', () => {
    expect(of({ solventCharacter: ['aqueous'] })).toEqual(['aqueous solvent']);
    expect(of({ solventCharacter: ['polar_aprotic', 'ethereal'] })).toEqual(['polar aprotic, ethereal solvent']);
  });
  it('the other fields are unchanged', () => {
    expect(of({ medium: 'basic', anhydrous: true, pressure: { kind: 'value', value: 2, unit: 'atm' }, time: { kind: 'value', value: 3, unit: 'h' }, text: 'x' })).toEqual([
      'pressure 2 atm',
      'time 3 h',
      'basic medium',
      'anhydrous',
      'as written: x',
    ]);
  });
});
