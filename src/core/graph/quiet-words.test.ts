/** What a student reads of an outcome (step 8.3, C8): "exclusive" only says "the one product", which textbooks do not write; every other word stays. */
import { describe, expect, it } from 'vitest';
import type { EquationTerm, FullEquation } from './full-equation';
import { shownWordOf, withoutExclusive } from './quiet-words';

describe('shownWordOf: one function decides the word', () => {
  it.each([
    ['exclusive', null],
    ['major', 'major'],
    ['minor', 'minor'],
    ['trace', 'trace'],
    ['mixture component', 'mixture component'],
    [null, null],
    ['exclusive · Saytzeff', 'Saytzeff'],
    ['major · Saytzeff', 'major · Saytzeff'],
  ] as const)('a student reads %j as %j', (word, expected) => expect(shownWordOf(word, false)).toBe(expected));
  it.each(['exclusive', 'major', 'minor', 'trace', 'mixture component', 'exclusive · Saytzeff', null] as const)('an author reads %j unchanged', (word) =>
    expect(shownWordOf(word, true)).toBe(word),
  );
});

const term = (name: string, word: EquationTerm['word'], over: Partial<EquationTerm> = {}): EquationTerm => {
  const quantifier = over.quantifier ?? null;
  const text = word === null ? name : `${name} (${quantifier === null ? '' : `${quantifier} `}${word})`;
  return { coefficient: null, name, word, quantifier, role: null, regiochemistry: null, text, ref: { kind: 'species', id: 'spc_x' }, substance: { kind: 'missing', name }, ...over } as EquationTerm;
};
const equation = (products: readonly EquationTerm[]): FullEquation =>
  ({ outcomeId: 'out_x', outcomeIds: ['out_x'], reactants: [term('A', null)], products, arrow: { above: [], below: [] }, equilibrium: false, text: 'A → B' }) as unknown as FullEquation;

describe('withoutExclusive: the same equation without the word "exclusive"', () => {
  it('drops the word and its quantifier from a product and writes its text without "(exclusive)"; other words stay', () => {
    const out = withoutExclusive(equation([term('B', 'exclusive'), term('C', 'major'), term('D', 'exclusive', { quantifier: 'both' })]));
    expect(out.products.map((p) => [p.word, p.quantifier, p.text])).toEqual([[null, null, 'B'], ['major', null, 'C (major)'], [null, null, 'D']]);
  });
  it('an equation with no "exclusive" is returned as it is (the same object)', () => {
    const plain = equation([term('B', 'major')]);
    expect(withoutExclusive(plain)).toBe(plain);
  });
  it('keeps the regiochemistry (it tells outcomes apart) and the reactants', () => {
    const out = withoutExclusive(equation([term('B', 'exclusive', { regiochemistry: 'Saytzeff' })]));
    expect(out.products[0]?.regiochemistry).toBe('Saytzeff');
    expect(out.reactants).toHaveLength(1);
  });
});
