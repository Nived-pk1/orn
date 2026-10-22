/**
 * Quick entry grammar (step 6.7b, Q2): "<left> -> <right>"; terms joined by " + "; "( ... )" after a term is CONDITION TEXT for its stage;
 * ", then " starts the next stage; errors in words with the position. Total: every input gives a result.
 */
import { describe, expect, it } from 'vitest';
import { MAX_QUICK_LINE, MAX_QUICK_TERMS, formatQuickEntry, parseQuickEntry, stageConditionText, type QuickEntry, type QuickError } from './grammar';

const ok = (line: string): QuickEntry => {
  const result = parseQuickEntry(line);
  if (!result.ok) throw new Error(`expected ok: ${JSON.stringify(result.errors)}`);
  return result.entry;
};
const bad = (line: string): readonly QuickError[] => {
  const result = parseQuickEntry(line);
  if (result.ok) throw new Error('expected errors');
  return result.errors;
};
const texts = (entry: QuickEntry) => ({
  stages: entry.stages.map((s) => s.terms.map((t) => (t.condition === undefined ? t.text : `${t.text} (${t.condition})`))),
  products: entry.products.map((t) => t.text),
});

describe('forms', () => {
  it('one stage, names, formulas and SMILES', () => {
    expect(texts(ok('ethanol + PCC -> ethanal'))).toEqual({ stages: [['ethanol', 'PCC']], products: ['ethanal'] });
    expect(texts(ok('C2H5OH + [O] -> CH3CHO + H2O'))).toEqual({ stages: [['C2H5OH', '[O]']], products: ['CH3CHO', 'H2O'] });
    expect(texts(ok('CC(=O)O + OCC -> CC(=O)OCC'))).toEqual({ stages: [['CC(=O)O', 'OCC']], products: ['CC(=O)OCC'] });
  });
  it('the three arrows', () => {
    for (const arrow of ['->', '→', '=>']) {
      const entry = ok(`a ${arrow} b`);
      expect(entry.arrow).toBe(arrow);
      expect(texts(entry)).toEqual({ stages: [['a']], products: ['b'] });
    }
    expect(texts(ok('a->b'))).toEqual({ stages: [['a']], products: ['b'] });
  });
  it("( ... ) after a term is condition text for that term's stage, not a name", () => {
    const entry = ok('ethanol + PCC (CH2Cl2) -> ethanal');
    expect(texts(entry)).toEqual({ stages: [['ethanol', 'PCC (CH2Cl2)']], products: ['ethanal'] });
    expect(entry.stages[0]?.terms[1]?.text).toBe('PCC');
    expect(entry.stages[0]?.terms[1]?.condition).toBe('CH2Cl2');
    expect(stageConditionText(entry.stages[0] as never)).toBe('CH2Cl2');
  });
  it('parentheses inside a name or SMILES (no space before) are part of the term', () => {
    expect(texts(ok('2-(bromomethyl)furan + NaOH (aq, 0 °C) -> x'))).toEqual({ stages: [['2-(bromomethyl)furan', 'NaOH (aq, 0 °C)']], products: ['x'] });
    expect(texts(ok('CC(C)(C)O -> C=C(C)C'))).toEqual({ stages: [['CC(C)(C)O']], products: ['C=C(C)C'] });
  });
  it('nested parentheses in condition text stay together', () => {
    expect(ok('a (b (c), d) -> e').stages[0]?.terms[0]?.condition).toBe('b (c), d');
  });
  it('", then " starts the next stage', () => {
    const entry = ok('CH3MgBr + ethanal, then H3O+ -> propan-2-ol');
    expect(texts(entry)).toEqual({ stages: [['CH3MgBr', 'ethanal'], ['H3O+']], products: ['propan-2-ol'] });
  });
  it("a stage has its own condition text; several terms' texts join with \"; \"", () => {
    const entry = ok('a (dry ether) + b (0 °C), then c (aq) -> d');
    expect(stageConditionText(entry.stages[0] as never)).toBe('dry ether; 0 °C');
    expect(stageConditionText(entry.stages[1] as never)).toBe('aq');
    expect(stageConditionText({ terms: [{ text: 'x', start: 0, end: 1 }] })).toBe('');
  });
  it('"+" that is part of a name (no spaces around it) does not split', () => {
    expect(texts(ok('H3O+ + Na+ -> x'))).toEqual({ stages: [['H3O+', 'Na+']], products: ['x'] });
    expect(texts(ok('[Na+] -> x'))).toEqual({ stages: [['[Na+]']], products: ['x'] });
  });
  it('whitespace is collapsed and trimmed; terms carry positions in the line', () => {
    const line = '  ethanol   +  PCC   ->   ethanal  ';
    const entry = ok(line);
    expect(texts(entry)).toEqual({ stages: [['ethanol', 'PCC']], products: ['ethanal'] });
    const first = entry.stages[0]?.terms[0] as { start: number; end: number };
    expect(line.slice(first.start, first.end)).toBe('ethanol');
  });
  it('formatQuickEntry writes the line back with the arrow shown', () => {
    expect(formatQuickEntry(ok('a + b (x), then c => d + e'))).toBe('a + b (x), then c => d + e');
    expect(formatQuickEntry(ok('a -> b'), '→')).toBe('a → b');
  });
});

describe('errors in words with the position', () => {
  const first = (line: string): QuickError => bad(line)[0] as QuickError;
  it('no arrow', () => {
    const error = first('ethanol + PCC');
    expect(error.message).toMatch(/no arrow/i);
    expect(error.message).toContain('->');
    expect(error.position).toBe('ethanol + PCC'.length);
  });
  it('two arrows name the second', () => {
    const line = 'a -> b -> c';
    const error = first(line);
    expect(error.message).toMatch(/two arrows/i);
    expect(error.message).toContain("after 'a -> b'");
    expect(error.position).toBe(line.indexOf('->', 4));
  });
  it('an empty side', () => {
    expect(first('-> ethanal').message).toMatch(/nothing before the arrow/i);
    expect(first('ethanol ->').message).toMatch(/nothing after the arrow/i);
    expect(first('   ').message).toMatch(/type a reaction/i);
    expect(first('').message).toMatch(/type a reaction/i);
  });
  it('an empty term names the place', () => {
    expect(first('ethanol + -> ethanal').message).toContain("after 'ethanol +'");
    expect(first('ethanol + -> ethanal').position).toBe(10);
    expect(first('+ ethanol -> x').message).toMatch(/at the start/i);
    expect(first('a -> b + ').message).toContain("after 'b +'");
    expect(first('a + + b -> c').message).toContain("after 'a +'");
  });
  it('an empty stage', () => {
    expect(first('a, then -> b').message).toMatch(/after 'a, then'/);
    expect(first(', then a -> b').message).toMatch(/at the start/i);
  });
  it('unbalanced parentheses', () => {
    expect(first('a (b -> c').message).toMatch(/never closed/i);
    expect(first('a (b -> c').message).toContain("after 'a'");
    expect(first('a) -> c').message).toMatch(/unbalanced/i);
    expect(first('a -> c(d').message).toMatch(/unbalanced/i);
  });
  it('condition text must end its term, hold something, and be single', () => {
    expect(first('a () -> b').message).toMatch(/empty/i);
    expect(first('a (x) y -> b').message).toMatch(/after the condition text/i);
    expect(first('a (x) (y) -> b').message).toMatch(/only one/i);
  });
  it('the right side holds products only', () => {
    expect(first('a -> b (aq)').message).toMatch(/condition text belongs before the arrow/i);
    expect(first('a -> b, then c').message).toMatch(/only allowed before the arrow/i);
  });
  it('several errors are all listed, in line order', () => {
    const errors = bad('a + -> b + ');
    expect(errors.length).toBeGreaterThanOrEqual(2);
    expect(errors.map((e) => e.position)).toEqual([...errors.map((e) => e.position)].sort((x, y) => x - y));
  });
  it('is bounded: a long line and too many terms say so', () => {
    expect(first('a'.repeat(MAX_QUICK_LINE + 1)).message).toMatch(/longer than/i);
    const many = `${Array.from({ length: MAX_QUICK_TERMS + 1 }, (_, i) => `t${i}`).join(' + ')} -> x`;
    expect(first(many).message).toMatch(/more than \d+ terms/i);
  });
  it('a non-string never throws', () => {
    expect(parseQuickEntry(undefined as never).ok).toBe(false);
    expect(parseQuickEntry(5 as never).ok).toBe(false);
  });
});
