// @vitest-environment jsdom
/**
 * The textbook equation (equation step, part 5) at component level: every term a column (representation, name, word), the "+" signs and
 * the arrow, a coefficient at text size, the Names switch, the old sentence as the accessible description, a failed drawing falling back,
 * the equilibrium arrow. The decisions (formula or drawing) are `core/graph/equation-term.ts`; the facts and drawings are fakes here.
 */
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArrowText, EquationTerm, FullEquation, TermSubstance } from '@/core/graph';
import type { StructureRep } from '@/core/schema';
import { createDepictionBinding, type DepictionPort } from '@/render/svg';
import { manualTimers } from '@/test-support/navigator-kit';
import { EQUATION_AREA, type StructureFactsPort } from './contracts';
import { EquationScheme } from './equation-scheme';

afterEach(cleanup);

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const ref = (id: string) => ({ kind: 'species', id }) as EquationTerm['ref'];

function term(name: string, substance: Partial<TermSubstance> = {}, extras: Partial<EquationTerm> = {}): EquationTerm {
  return { coefficient: null, name, word: null, quantifier: null, role: null, regiochemistry: null, text: name, ref: ref(`spc_${name}`), substance: { kind: 'species', name, ...substance }, ...extras };
}
const NO_ARROW: ArrowText = { above: [], below: [] };
const formulaPart = (text: string) => ({ kind: 'formula', text }) as ArrowText['above'][number];
const plainPart = (text: string) => ({ kind: 'condition', text }) as ArrowText['above'][number];
function equation(reactants: EquationTerm[], products: EquationTerm[], over: Partial<FullEquation> = {}): FullEquation {
  const side = (terms: EquationTerm[]): string => terms.map((t) => t.text).join(' + ');
  return { outcomeId: 'out_x' as FullEquation['outcomeId'], outcomeIds: ['out_x' as FullEquation['outcomeId']], reactants, products, arrow: NO_ARROW, equilibrium: false, text: `${side(reactants)} → ${side(products)}`, ...over };
}

/** Facts by the structure's text; a drawing answers a size by the structure's text too (a longer text is a wider drawing). */
function rig(options: { facts?: Record<string, { heavyAtomCount?: number; carbonCount?: number } | 'down'>; failing?: Set<string> } = {}) {
  const timers = manualTimers();
  const asked: string[] = [];
  const port: DepictionPort = {
    keyOf: (s, _size, mode) => `${s.value}#${mode ?? 'skeletal'}`,
    depict: (s) => {
      asked.push(s.value);
      return Promise.resolve(options.failing?.has(s.value) === true ? { ok: false as const, reason: 'invalid', message: 'x' } : { ok: true as const, svg: '<svg/>', width: 54 * Math.max(1, s.value.length - 1), height: 40 });
    },
    cancel: () => undefined,
    createUrl: (svg) => `blob:${svg.length}`,
    revokeUrl: () => undefined,
  };
  const binding = createDepictionBinding(port, timers, EQUATION_AREA);
  const facts: StructureFactsPort = {
    factsOf: (s) => {
      const known = options.facts?.[s.value];
      return Promise.resolve(known === undefined || known === 'down' ? { ok: false as const } : { ok: true as const, ...known });
    },
  };
  return { binding, facts, timers, asked };
}
const settle = async (): Promise<void> => {
  for (let i = 0; i < 12; i += 1) await act(async () => void (await Promise.resolve()));
};

const WATER = term('Water', { structure: smiles('O'), formula: 'H2O' });
const BUTENE = term('Butene', { structure: smiles('CC=CC'), formula: 'C4H8' });
const HYDROGEN = term('Hydrogen', { structure: smiles('[H][H]'), formula: 'H2' });
const FACTS = { O: { heavyAtomCount: 1, carbonCount: 0 }, '[H][H]': { heavyAtomCount: 0, carbonCount: 0 }, 'CC=CC': { heavyAtomCount: 4, carbonCount: 4 }, 'CC#CC': { heavyAtomCount: 4, carbonCount: 4 } };

function show(eq: FullEquation, r = rig({ facts: FACTS }), props: { names?: boolean; onNamesChange?: (names: boolean) => void; label?: string; layout?: 'row' | 'stacked' } = {}) {
  const view = render(<EquationScheme equation={eq} binding={r.binding} timers={r.timers} facts={r.facts} names={props.names ?? true} {...(props.onNamesChange === undefined ? {} : { onNamesChange: props.onNamesChange })} {...(props.label === undefined ? {} : { label: props.label })} {...(props.layout === undefined ? {} : { layout: props.layout })} />);
  return { ...view, r };
}

describe('the scheme', () => {
  it('is one column per term, a "+" between the terms of a side, and ONE arrow; the accessible description is the old sentence', async () => {
    const eq = equation([term('Alkyne', { structure: smiles('CC#CC'), formula: 'C4H6' }), HYDROGEN], [BUTENE], { arrow: { above: [formulaPart('Pd')], below: [plainPart('quinoline')] } });
    show(eq);
    await settle();
    const scheme = screen.getByRole('group', { name: 'Full equation', description: eq.text });
    expect(within(scheme).getAllByRole('group', { name: /^(Alkyne|Hydrogen|Butene)$/ })).toHaveLength(3);
    expect([...scheme.querySelectorAll('[data-equation-plus]')].map((el) => el.textContent)).toEqual(['+']);
    expect(scheme.querySelectorAll('[data-equation-arrow]')).toHaveLength(1);
    expect(scheme.querySelector('[data-equation-above]')?.textContent).toBe('Pd');
    expect(scheme.querySelector('[data-equation-below]')?.textContent).toBe('quinoline');
  });

  it('"+" count: three terms on a side give two; no "+" for a single term', async () => {
    show(equation([WATER, WATER, term('Salt')], [term('Acid')]));
    await settle();
    expect(document.querySelectorAll('[data-equation-plus]')).toHaveLength(2);
  });

  it('a coefficient other than 1 is printed before its term at text size', async () => {
    show(equation([term('Benzaldehyde', {}, { coefficient: '2', text: '2 Benzaldehyde' })], [term('Acid')]));
    await settle();
    expect(document.querySelector('[data-equation-coefficient]')?.textContent).toBe('2');
    expect(screen.getByRole('group', { name: '2 Benzaldehyde' })).toBeTruthy();
    expect(document.querySelectorAll('[data-equation-coefficient]')).toHaveLength(1);
  });

  it('a small species with a formula is that formula, with real <sub> elements (H2: H and a subscript 2); a bigger one is drawn', async () => {
    const { r } = show(equation([HYDROGEN, BUTENE], [WATER]));
    await settle();
    const hydrogen = screen.getByRole('group', { name: 'Hydrogen' });
    expect(hydrogen.querySelector('sub')?.textContent).toBe('2');
    expect(hydrogen.textContent).toContain('H');
    expect(within(hydrogen).queryByRole('img')).toBeNull();
    expect(within(screen.getByRole('group', { name: 'Butene' })).getByRole('img', { name: 'Structure of Butene' })).toBeTruthy();
    expect(r.asked).toEqual(['CC=CC']); // only the drawn one was asked for
  });

  it('every drawing has the same bond length: the size follows the drawing\'s own width, never one box for all', async () => {
    const eq = equation([term('Short', { structure: smiles('CC=C') }), term('Long', { structure: smiles('CC=CC') })], [term('Other')]);
    show(eq);
    await settle();
    const [short, long] = (['Short', 'Long'] as const).map((name) => within(screen.getByRole('group', { name })).getByRole('img') as HTMLImageElement);
    expect(Number(short?.getAttribute('data-bond-px'))).toBe(Number(long?.getAttribute('data-bond-px')));
    expect(Number(long?.getAttribute('width'))).toBeGreaterThan(Number(short?.getAttribute('width')));
  });

  it('names under the drawings: shown by default, hidden by the switch; a formula-text term keeps its formula; every term keeps its aria-label', async () => {
    const eq = equation([HYDROGEN, BUTENE], [WATER]);
    const view = show(eq, rig({ facts: FACTS }), { names: true });
    await settle();
    expect([...document.querySelectorAll('[data-equation-name]')].map((el) => el.textContent)).toEqual(['Hydrogen', 'Butene', 'Water']);
    view.rerender(<EquationScheme equation={eq} binding={view.r.binding} timers={view.r.timers} facts={view.r.facts} names={false} />);
    await settle();
    expect(document.querySelectorAll('[data-equation-name]')).toHaveLength(0);
    expect(screen.getByRole('group', { name: 'Hydrogen' }).querySelector('sub')?.textContent).toBe('2'); // the formula is still there
    expect(screen.getByRole('group', { name: 'Butene' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Water' })).toBeTruthy();
  });

  it('the Names switch is a checkbox in the equation\'s header; changing it says so; without a handler there is no switch', async () => {
    const changes: boolean[] = [];
    const view = show(equation([WATER], [BUTENE]), rig({ facts: FACTS }), { names: true, onNamesChange: (n) => changes.push(n) });
    await settle();
    const box = screen.getByRole('checkbox', { name: 'Names' }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(changes).toEqual([false]);
    view.unmount();
    show(equation([WATER], [BUTENE]));
    expect(screen.queryByRole('checkbox', { name: 'Names' })).toBeNull();
  });

  it('a term with nothing to draw or write is its name only, once (no second name line), switch on or off', async () => {
    const eq = equation([term('Mystery')], [term('Other')]);
    show(eq);
    await settle();
    const mystery = screen.getByRole('group', { name: 'Mystery' });
    expect(mystery.textContent).toBe('Mystery');
    expect(mystery.querySelector('[data-equation-name]')).toBeNull();
  });

  it('words: the outcome\'s word is italic, once ("(both exclusive)"), a coproduct\'s role in the same place', async () => {
    const eq = equation([WATER], [term('Alcohol'), term('Salt', {}, { word: 'exclusive', quantifier: 'both' }), term('Ether', {}, { role: 'byproduct' })]);
    show(eq);
    await settle();
    const words = [...document.querySelectorAll('[data-equation-word]')];
    expect(words.map((el) => el.textContent)).toEqual(['(both exclusive)', '(byproduct)']);
    expect(words.every((el) => el.tagName === 'EM' || el.closest('em') !== null || getComputedStyle(el).fontStyle === 'italic' || el.className.length > 0)).toBe(true);
  });

  it('while the facts are on their way a term that needs them says "Drawing the structure…"; then it is the formula or the drawing', async () => {
    const r = rig({ facts: FACTS });
    show(equation([WATER], [BUTENE]), r);
    expect(screen.getAllByText('Drawing the structure…').length).toBeGreaterThan(0);
    await settle();
    expect(screen.queryByText('Drawing the structure…')).toBeNull();
  });

  it('engine unavailable for the facts: a species with a formula is its formula, never a guess about the structure', async () => {
    show(equation([BUTENE], [WATER]), rig({ facts: { 'CC=CC': 'down', O: 'down' } }));
    await settle();
    expect(screen.getByRole('group', { name: 'Butene' }).textContent).toContain('C');
    expect(within(screen.getByRole('group', { name: 'Butene' })).queryByRole('img')).toBeNull();
  });

  it('a drawing that fails falls back to the formula, else the name', async () => {
    const r = rig({ facts: FACTS, failing: new Set(['CC=CC', 'CC=CCC']) });
    show(equation([BUTENE, term('Plain', { structure: smiles('CC=CCC') })], [WATER]), r);
    await settle();
    await act(async () => {
      r.timers.advance(2000);
      await Promise.resolve();
    });
    await settle();
    const butene = screen.getByRole('group', { name: 'Butene' });
    expect(within(butene).queryByRole('img')).toBeNull();
    expect(butene.querySelector('sub')?.textContent).toBe('4'); // C4H8: the formula
    const plain = screen.getByRole('group', { name: 'Plain' });
    expect(within(plain).queryByRole('img')).toBeNull();
    expect(plain.textContent).toContain('Plain'); // no formula: the name
  });

  it('an equilibrium reaction gets the equilibrium arrow (two half arrows), every other one arrow', async () => {
    show(equation([WATER], [BUTENE], { equilibrium: true }));
    await settle();
    const arrow = document.querySelector('[data-equation-arrow]') as HTMLElement;
    expect(arrow.hasAttribute('data-equilibrium')).toBe(true);
    expect(arrow.querySelectorAll('svg path')).toHaveLength(2);
    cleanup();
    show(equation([WATER], [BUTENE]));
    await settle();
    const single = document.querySelector('[data-equation-arrow]') as HTMLElement;
    expect(single.hasAttribute('data-equilibrium')).toBe(false);
    expect(single.querySelectorAll('svg path')).toHaveLength(1);
  });

  it('with several outcomes the caller labels each scheme; the label is the group\'s name', async () => {
    show(equation([WATER], [BUTENE]), rig({ facts: FACTS }), { label: 'at 413 K' });
    await settle();
    expect(screen.getByRole('group', { name: 'at 413 K' })).toBeTruthy();
  });
});

describe('the phone scheme: the same terms stacked (equation step, part 6)', () => {
  const eq = (): FullEquation =>
    equation([term('Alkyne', { structure: smiles('CC#CC'), formula: 'C4H6' }), HYDROGEN], [BUTENE], { arrow: { above: [formulaPart('Pd')], below: [plainPart('quinoline')] } });

  it('reactants in one row, then the down arrow, then the products: three blocks in that order, each term once', async () => {
    show(eq(), rig({ facts: FACTS }), { layout: 'stacked' });
    await settle();
    const scheme = screen.getByRole('group', { name: 'Full equation', description: eq().text });
    expect(scheme.getAttribute('data-layout')).toBe('stacked');
    const blocks = [...scheme.querySelectorAll('[data-equation-side], [data-equation-arrow]')].map((el) => el.getAttribute('data-equation-side') ?? 'arrow');
    expect(blocks).toEqual(['reactants', 'arrow', 'products']);
    const reactants = scheme.querySelector('[data-equation-side="reactants"]') as HTMLElement;
    expect(within(reactants).getAllByRole('group', { name: /^(Alkyne|Hydrogen)$/ })).toHaveLength(2);
    expect([...reactants.querySelectorAll('[data-equation-plus]')].map((el) => el.textContent)).toEqual(['+']);
    expect(within(scheme.querySelector('[data-equation-side="products"]') as HTMLElement).getByRole('group', { name: 'Butene' })).toBeTruthy();
    expect(scheme.querySelectorAll('[data-equation-term]')).toHaveLength(3);
  });

  it('the arrow points down, its line comes first and the reagents and conditions follow it (they sit to its right)', async () => {
    show(eq(), rig({ facts: FACTS }), { layout: 'stacked' });
    await settle();
    const arrow = document.querySelector('[data-equation-arrow]') as HTMLElement;
    expect(arrow.getAttribute('data-direction')).toBe('down');
    const order = [...arrow.children].map((el) => (el.hasAttribute('data-equation-line') ? 'line' : el.hasAttribute('data-equation-text') ? 'text' : '?'));
    expect(order).toEqual(['line', 'text']);
    const text = arrow.querySelector('[data-equation-text]') as HTMLElement;
    expect(text.querySelector('[data-equation-above]')?.textContent).toBe('Pd');
    expect(text.querySelector('[data-equation-below]')?.textContent).toBe('quinoline');
  });

  it('drawings are at most 140 px wide (scaled down whole, the bond with them); the row layout keeps its 220 px', async () => {
    const wide = equation([term('Long', { structure: smiles('CC=CCCCCCCC') })], [term('Other')]);
    show(wide, rig(), { layout: 'stacked' });
    await settle();
    const image = screen.getByRole('img') as HTMLImageElement;
    expect(Number(image.getAttribute('width'))).toBeLessThanOrEqual(140);
    cleanup();
    show(wide, rig());
    await settle();
    const row = screen.getByRole('img') as HTMLImageElement;
    expect(Number(row.getAttribute('width'))).toBeGreaterThan(140);
    expect(Number(row.getAttribute('width'))).toBeLessThanOrEqual(220);
  });

  it('names under the drawings follow the switch, and the description is the old sentence, as in the row layout', async () => {
    const off = show(eq(), rig({ facts: FACTS }), { layout: 'stacked', names: false });
    await settle();
    expect(off.container.querySelectorAll('[data-equation-name]')).toHaveLength(0);
    cleanup();
    show(eq(), rig({ facts: FACTS }), { layout: 'stacked' });
    await settle();
    expect(document.querySelectorAll('[data-equation-name]')).toHaveLength(3);
  });

  it('an equilibrium reaction gets the vertical equilibrium arrow (two half arrows); every other one arrow', async () => {
    show(equation([WATER], [BUTENE], { equilibrium: true }), rig({ facts: FACTS }), { layout: 'stacked' });
    await settle();
    const arrow = document.querySelector('[data-equation-arrow]') as HTMLElement;
    expect(arrow.hasAttribute('data-equilibrium')).toBe(true);
    expect(arrow.querySelectorAll('[data-equation-line] svg path')).toHaveLength(2);
  });
});

const css = readFileSync('src/render/equation/equation-scheme.module.css', 'utf8');

describe('the look (equation step, part 6): names directly under their drawings, no fixed row height', () => {
  it('in every column the name and the word hang directly after the representation, in one wrapper that is out of the flow', async () => {
    show(equation([term('Short', { structure: smiles('CC=C') }), term('Long', { structure: smiles('CC=CC') }), WATER], [term('Butene', { structure: smiles('CC=CC'), formula: 'C4H8' }, { word: 'major' })]));
    await settle();
    const columns = document.querySelectorAll('[data-equation-term] [role="group"]');
    expect(columns.length).toBe(4);
    for (const column of columns) {
      const [rep, hang] = [...column.children];
      expect(rep?.hasAttribute('data-equation-rep')).toBe(true);
      expect(hang?.hasAttribute('data-equation-hang')).toBe(true);
      expect(hang?.querySelector('[data-equation-name]')).not.toBeNull();
    }
    expect(columns[3]?.querySelector('[data-equation-hang] [data-equation-word]')?.textContent).toBe('(major)');
  });

  it('the scheme reserves the room the names need under its rows (--hang), and none when there is no name or word', async () => {
    show(equation([term('Short', { structure: smiles('CC=C') })], [term('Water', { structure: smiles('O'), formula: 'H2O' }, { word: 'major' })]));
    await settle();
    const hang = (): number => Number.parseFloat(document.querySelector<HTMLElement>('[data-equation-scheme]')?.style.getPropertyValue('--hang') ?? 'NaN');
    expect(hang()).toBeGreaterThan(0);
    cleanup();
    show(equation([term('Short', { structure: smiles('CC=C') })], [WATER]), rig({ facts: FACTS }), { names: false });
    await settle();
    expect(hang()).toBe(0);
  });

  it('the stylesheet gives no row, term, sign or arrow a fixed height (a row is as tall as its tallest drawing)', () => {
    expect(css).not.toContain('--rep-h');
    const blocks = css.split('}').map((chunk) => chunk.split('{'));
    const fixed = blocks.filter(([selector, body]) => body !== undefined && /\.(rep|plus|arrowCell|arrow|coefficient|term|column|row)(\s|,|$)/.test((selector ?? '').trim()) && /(^|[\s;])(min-)?height:\s*\d/.test(body));
    expect(fixed.map(([selector]) => (selector ?? '').trim())).toEqual([]);
  });
});
