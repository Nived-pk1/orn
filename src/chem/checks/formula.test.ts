/**
 * Element counts from a formula string (CHEM-003, CHEM-005): condensed forms, groups, hydrates, charge suffixes, and everything that
 * must be "not readable" rather than guessed. The comparison is of COUNTS, so `C2H5OH` and a Hill `C2H6O` are the same.
 */
import { describe, expect, it } from 'vitest';
import { addScaled, countDifferences, countsText, MAX_FORMULA_CHARS, parseFormula } from './formula';

const counts = (text: string): Record<string, number> => {
  const read = parseFormula(text);
  if (!read.ok) throw new Error(`${text}: ${read.reason}`);
  return { ...read.counts };
};

describe('parseFormula reads element counts', () => {
  it.each([
    ['C2H6O', { C: 2, H: 6, O: 1 }],
    ['C2H5OH', { C: 2, H: 6, O: 1 }],
    ['CH3COOH', { C: 2, H: 4, O: 2 }],
    ['CH3COOC2H5', { C: 4, H: 8, O: 2 }],
    ['Ca(OH)2', { Ca: 1, O: 2, H: 2 }],
    ['Al2(SO4)3', { Al: 2, S: 3, O: 12 }],
    ['K4[Fe(CN)6]', { K: 4, Fe: 1, C: 6, N: 6 }],
    ['((CH3)2CH)2O', { C: 6, H: 14, O: 1 }],
    ['CuSO4.5H2O', { Cu: 1, S: 1, O: 9, H: 10 }],
    ['CuSO4·5H2O', { Cu: 1, S: 1, O: 9, H: 10 }],
    ['H₂O', { H: 2, O: 1 }],
    ['C6H5 NH2', { C: 6, H: 7, N: 1 }],
    ['CO', { C: 1, O: 1 }],
    ['Co', { Co: 1 }],
    ['HCl', { H: 1, Cl: 1 }],
  ])('%s', (text, expected) => {
    expect(counts(text)).toEqual(expected);
  });

  it('a formula of condensed form and its Hill form have the same counts (never compared as strings)', () => {
    expect(counts('CH3COOH')).toEqual(counts('C2H4O2'));
    expect(countDifferences(counts('C2H5OH'), counts('C2H6O'))).toEqual({});
  });

  it('a charge suffix is ignored when unambiguous (the charge is CHEM-004\'s)', () => {
    expect(counts('H3O+')).toEqual({ H: 3, O: 1 });
    expect(counts('Cl-')).toEqual({ Cl: 1 });
    expect(counts('SO4^2-')).toEqual({ S: 1, O: 4 });
    expect(counts('Fe^3+')).toEqual({ Fe: 1 });
    expect(counts('SO4²⁻')).toEqual({ S: 1, O: 4 });
  });
});

describe('parseFormula says "not readable" and why, never guessing', () => {
  it.each([
    ['', 'empty'],
    ['Ph', 'is not an element symbol'],
    ['CH3R', 'is not an element symbol'],
    ['C6H5-X', 'is not part of a formula'],
    ['Ca(OH', 'not closed'],
    ['CaOH)2', 'do not match'],
    ['Ca(OH]2', 'do not match'],
    ['C0H4', 'out of range'],
    ['Al3+', 'could be an atom count'],
    ['NH4+', 'could be an atom count'],
    ['SO42-', 'could be an atom count'],
    ['C2H5OH?', 'is not part of a formula'],
    ['()', 'no atoms'],
  ])('%s', (text, why) => {
    const read = parseFormula(text);
    expect(read.ok).toBe(false);
    expect(read.ok ? '' : read.reason).toContain(why);
  });

  it('is bounded: too long, too deep, too large', () => {
    expect(parseFormula('C'.repeat(MAX_FORMULA_CHARS + 1)).ok).toBe(false);
    expect(parseFormula(`${'('.repeat(20)}C${')'.repeat(20)}`)).toMatchObject({ ok: false, reason: expect.stringContaining('nested too deeply') });
    expect(parseFormula('C99999999')).toMatchObject({ ok: false });
    expect(parseFormula('(C99999)99999')).toMatchObject({ ok: false });
  });
});

describe('the count helpers', () => {
  it('differences are nonzero entries only; text is Hill order; scaling adds', () => {
    expect(countDifferences({ C: 2, H: 6 }, { C: 2, H: 4, O: 1 })).toEqual({ H: 2, O: -1 });
    expect(countsText({ O: 1, H: 6, C: 2 })).toBe('C2H6O');
    expect(countsText({ Br: 1, H: 1 })).toBe('BrH');
    const total: Record<string, number> = {};
    addScaled(total, { H: 2, O: 1 }, 2);
    addScaled(total, { H: 2 }, 0.5);
    expect(total).toEqual({ H: 5, O: 2 });
    expect(countDifferences({ H: 0.1 + 0.2 }, { H: 0.3 })).toEqual({});
  });
});
