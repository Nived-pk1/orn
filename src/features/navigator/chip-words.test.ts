/** The words on an arrow's chip (step 8.2b, D): one reaction shows its reagent words, more show the number; a chip that would overlap keeps the number. Pure. */
import { describe, expect, it } from 'vitest';
import type { ArrowTextPart } from '@/core/graph';
import { chipTextOf, clipRuns, clipWords, resolveChips, type ChipWish } from './chip-words';

const formula = (text: string): ArrowTextPart => ({ text, kind: 'formula' });
const name = (text: string): ArrowTextPart => ({ text, kind: 'name' });
const written = (runs: readonly { readonly text: string }[] | undefined): string => (runs ?? []).map((run) => run.text).join('');

describe('clipWords', () => {
  it('keeps 14 characters or fewer as they are and cuts longer words at 14 with an ellipsis', () => {
    expect(clipWords('PCC')).toBe('PCC');
    expect(clipWords('12345678901234')).toBe('12345678901234');
    expect(clipWords('123456789012345')).toBe('12345678901234…');
  });
});

describe('chipTextOf', () => {
  it('one reaction with words: the words; the name carries them whole', () => {
    expect(chipTextOf(1, 'PCC')).toEqual({ text: 'PCC', name: 'PCC' });
    expect(chipTextOf(1, 'a very long reagent name')).toEqual({ text: 'a very long re…', name: 'a very long reagent name' });
  });
  it('one reaction without words, or several reactions: the number', () => {
    expect(chipTextOf(1, undefined)).toEqual({ text: '1', name: '1 reaction' });
    expect(chipTextOf(3, 'PCC')).toEqual({ text: '3', name: '3 reactions' });
  });
});

describe('resolveChips: words unless they would overlap another chip', () => {
  const wish = (key: string, x: number, over: Partial<ChipWish> = {}): ChipWish => ({ key, at: { x, y: 0 }, count: 1, words: 'PCC', ...over });
  it('chips far apart all take their words', () => {
    const out = resolveChips([wish('a', 0), wish('b', 300)]);
    expect(out.get('a')?.text).toBe('PCC');
    expect(out.get('b')?.text).toBe('PCC');
  });
  it('a words chip that would overlap another chip falls back to the number (the later key; the first keeps its words)', () => {
    const out = resolveChips([wish('a', 0), wish('b', 40)]); // 40 apart: a's words fit beside b's number, b's words would not
    expect(out.get('a')?.text).toBe('PCC');
    expect(out.get('b')?.text).toBe('1');
  });
  it('a lone arrow (no number chip today) whose words would overlap gets no chip at all', () => {
    const out = resolveChips([wish('a', 0, { count: 2, words: undefined }), wish('b', 10, { base: 'none' })]);
    expect(out.get('a')?.text).toBe('2');
    expect(out.has('b')).toBe(false);
  });
  it('a chip with no words keeps its number and is checked for nothing', () => {
    expect(resolveChips([wish('a', 0, { words: undefined, count: 4 })]).get('a')?.text).toBe('4');
  });
  it('is deterministic: the same wishes in another order give the same answer', () => {
    const wishes = [wish('a', 0), wish('b', 30), wish('c', 60)];
    const one = resolveChips(wishes);
    const two = resolveChips([...wishes].reverse());
    expect([...one.entries()].sort()).toEqual([...two.entries()].sort());
  });
});

describe('resolveChips: words never cover a box', () => {
  it('a words chip that would overlap a box keeps its number', () => {
    const out = resolveChips([{ key: 'a', at: { x: 0, y: 0 }, count: 1, words: 'PCC' }], [{ x: 14, y: -10, width: 100, height: 20 }]);
    expect(out.get('a')?.text).toBe('1');
  });
});

describe('resolveChips in a chain: numbered chips', () => {
  it('a step shows "2" or "2: PCC", and the name says the step', () => {
    const out = resolveChips([
      { key: 'a', at: { x: 0, y: 0 }, count: 3, step: 1 },
      { key: 'b', at: { x: 300, y: 0 }, count: 1, step: 2, words: 'PCC' },
    ]);
    expect(out.get('a')).toMatchObject({ text: '1', name: 'step 1: 3 reactions' });
    expect(out.get('b')).toMatchObject({ text: '2: PCC', name: 'step 2: PCC' });
  });
});

describe('chip words in the reaction card typography (step 8.3, A3)', () => {
  it('a formula part gets subscripts and a name stays plain, as on the reaction card; the name and the tooltip stay the plain words', () => {
    const chip = chipTextOf(1, 'H2SO4, Pd/C', [formula('H2SO4'), name('Pd/C')]);
    expect(chip.text).toBe('H2SO4, Pd/C');
    expect(chip.name).toBe('H2SO4, Pd/C');
    expect(chip.runs).toEqual([{ text: 'H' }, { text: '2', script: 'sub' }, { text: 'SO' }, { text: '4', script: 'sub' }, { text: ', Pd/C' }]);
  });
  it('the cut counts visible characters: 14 of them, then an ellipsis; the subscripts survive in the part that is kept', () => {
    const parts = [formula('CH3MgBr'), name('Diethyl ether')];
    const chip = chipTextOf(1, 'CH3MgBr, Diethyl ether', parts);
    expect(chip.text).toBe('CH3MgBr, Dieth…');
    expect(written(chip.runs)).toBe('CH3MgBr, Dieth…');
    expect(chip.runs).toContainEqual({ text: '3', script: 'sub' });
    expect(written(clipRuns([{ text: '12345678901234' }])).length).toBe(14);
    expect(written(clipRuns([{ text: '1234567' }, { text: '89', script: 'sub' }, { text: '0123456' }]))).toBe('12345678901234…');
  });
  it('no parts, or several reactions: no runs (the number, or plain words)', () => {
    expect(chipTextOf(1, 'PCC').runs).toBeUndefined();
    expect(chipTextOf(3, 'H2O', [formula('H2O')]).runs).toBeUndefined();
  });
  it('a chain step keeps the subscripts after its number: "2: H2O"', () => {
    const out = resolveChips([{ key: 'a', at: { x: 0, y: 0 }, count: 1, words: 'H2O', parts: [formula('H2O')], step: 2 }]);
    expect(out.get('a')?.text).toBe('2: H2O');
    expect(written(out.get('a')?.runs)).toBe('2: H2O');
    expect(out.get('a')?.runs).toContainEqual({ text: '2', script: 'sub' });
  });
});
