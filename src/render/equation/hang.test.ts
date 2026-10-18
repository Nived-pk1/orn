import { describe, expect, it } from 'vitest';
import type { EquationTerm } from '@/core/graph';
import { hangOf, wordOf } from './hang';

const term = (name: string, extras: Partial<EquationTerm> = {}): EquationTerm =>
  ({ coefficient: null, name, word: null, quantifier: null, role: null, text: name, ref: { kind: 'species', id: 'spc_x' }, substance: { kind: 'species', name }, ...extras }) as EquationTerm;

describe('the room for hanging names', () => {
  it('is 0 without names and words, and grows with the lines of the tallest name and word', () => {
    expect(hangOf([term('Ethanol')], false)).toBe(0);
    const one = hangOf([term('Ethanol')], true);
    expect(one).toBeGreaterThan(0);
    expect(hangOf([term('Ethanol'), term('Ethanal', { word: 'exclusive' })], true)).toBeGreaterThan(one); // a word is one more line
    expect(hangOf([term('A name that is long enough to wrap onto a second line of its column')], true)).toBeGreaterThan(one);
  });

  it('with names off a word still needs its line', () => {
    expect(hangOf([term('Ethanal', { word: 'exclusive' })], false)).toBeGreaterThan(0);
  });

  it('the word is the outcome\'s word with its quantifier, else the role, else nothing', () => {
    expect(wordOf(term('x', { word: 'exclusive', quantifier: 'both' }))).toBe('(both exclusive)');
    expect(wordOf(term('x', { role: 'byproduct' }))).toBe('(byproduct)');
    expect(wordOf(term('x'))).toBeNull();
  });
});
