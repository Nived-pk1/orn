import { describe, expect, it } from 'vitest';
import { countLine, familyWord, mixtureWords, usedWords } from './model';

describe('the words of a reagent row (7.3c D1)', () => {
  it('counts reactions and profiles; no profile is not mentioned', () => {
    expect(usedWords({ reactions: 3, profiles: 2 })).toBe('3 reactions · 2 profiles');
    expect(usedWords({ reactions: 1, profiles: 1 })).toBe('1 reaction · 1 profile');
    expect(usedWords({ reactions: 0, profiles: 0 })).toBe('0 reactions');
  });
  it('a mixture is named by its parts; a species backing says nothing here', () => {
    expect(mixtureWords({ kind: 'mixture', parts: [{ kind: 'species', id: 'a', name: 'Pd', role: 'active' }, { kind: 'species', id: 'b', name: 'Quinoline', role: 'poison' }] })).toBe('Mixture of Pd, Quinoline');
    expect(mixtureWords({ kind: 'species', id: 'a', name: 'KOH' })).toBeUndefined();
    expect(mixtureWords(undefined)).toBeUndefined();
  });
  it('families are the stored value with spaces', () => {
    expect(familyWord('lewis_acid')).toBe('lewis acid');
    expect(familyWord('oxidant')).toBe('oxidant');
  });
  it('the count line says how many a filter left', () => {
    expect(countLine(16, 16)).toBe('16 reagents');
    expect(countLine(3, 16)).toBe('3 of 16 reagents');
    expect(countLine(1, 1)).toBe('1 reagent');
  });
});
