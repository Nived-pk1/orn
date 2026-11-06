// @vitest-environment jsdom
/** The "From A to B" panel (step 8.2b, C2): the selects, Swap, the chains and their steps, the words, Esc. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChainPanel } from './chain-panel';

afterEach(cleanup);

const families = [
  { id: 'alk', name: 'Alkenes' },
  { id: 'alc', name: 'Alcohols' },
  { id: 'ald', name: 'Aldehydes' },
  { id: 'iso', name: 'Isolated' },
];
const cand = (reactionId: string) => ({ reactionId });
const pairs = [
  { from: 'alk', to: 'alc', candidates: [cand('r1')] },
  { from: 'alc', to: 'ald', candidates: [cand('r2'), cand('r3'), cand('r4')] },
  { from: 'alk', to: 'ald', candidates: [cand('r5')] },
  { from: 'alc', to: 'alc', candidates: [cand('r6')] },
];
const facts = (from: string, to: string) => (from === 'alk' && to === 'alc' ? { reactions: 1, words: 'PCC' } : from === 'alc' && to === 'ald' ? { reactions: 3 } : { reactions: 1 });

function setup(over: Partial<Parameters<typeof ChainPanel>[0]> = {}) {
  const onChain = vi.fn();
  const onOpenStep = vi.fn();
  const onClose = vi.fn();
  render(<ChainPanel families={families} pairs={() => pairs} facts={facts} onChain={onChain} onOpenStep={onOpenStep} onClose={onClose} {...over} />);
  return { onChain, onOpenStep, onClose };
}
const choose = (from: string, to: string): void => {
  fireEvent.change(screen.getByRole('combobox', { name: 'From' }), { target: { value: from } });
  fireEvent.change(screen.getByRole('combobox', { name: 'To' }), { target: { value: to } });
};

describe('ChainPanel', () => {
  it('starts with both selects on "Choose a family", says it spans all chapters, and offers no chain yet', () => {
    const { onChain } = setup();
    expect((screen.getByRole('combobox', { name: 'From' }) as HTMLSelectElement).selectedOptions[0]?.text).toBe('Choose a family');
    expect((screen.getByRole('combobox', { name: 'To' }) as HTMLSelectElement).selectedOptions[0]?.text).toBe('Choose a family');
    expect(screen.getByText('Across all chapters')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Chains' })).toBeNull();
    expect(onChain).toHaveBeenLastCalledWith(undefined);
  });
  it('lists the chains as "A → B → C", the direct one first, and chooses the first row', () => {
    const { onChain } = setup();
    choose('alk', 'ald');
    const rows = [...screen.getByRole('list', { name: 'Chains' }).children];
    expect(rows).toHaveLength(2);
    // each chain is ONE card (step 8.3b, B2.1): its title and a summary line
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: /^Alkenes → Aldehydes\b.*1 step · 1 reaction$/ })).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByRole('button', { name: /^Alkenes → Alcohols → Aldehydes\b.*2 steps · 4 reactions$/ })).toBeTruthy();
    expect(onChain).toHaveBeenLastCalledWith([{ from: 'alk', to: 'ald' }]);
  });
  it('choosing the second row draws that chain; its steps say the reagent words or the number of reactions', () => {
    const { onChain } = setup();
    choose('alk', 'ald');
    fireEvent.click(screen.getByRole('button', { name: /^Alkenes → Alcohols → Aldehydes/ }));
    expect(onChain).toHaveBeenLastCalledWith([
      { from: 'alk', to: 'alc' },
      { from: 'alc', to: 'ald' },
    ]);
    expect(screen.getByRole('button', { name: /^Alkenes → Alcohols · PCC/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Alcohols → Aldehydes · 3 reactions/ })).toBeTruthy();
  });
  it('a step whose words hold a formula sets it in subscripts, as the reaction card does (step 8.3, A3)', () => {
    const withFormula = (from: string, to: string) =>
      from === 'alk' && to === 'alc' ? { reactions: 1, words: 'H2SO4', parts: [{ text: 'H2SO4', kind: 'formula' as const }] } : facts(from, to);
    setup({ facts: withFormula });
    choose('alk', 'ald');
    fireEvent.click(screen.getByRole('button', { name: /^Alkenes → Alcohols → Aldehydes/ }));
    const step = screen.getByRole('button', { name: /^Alkenes → Alcohols · H2SO4/ });
    expect([...step.querySelectorAll('sub')].map((sub) => sub.textContent)).toEqual(['2', '4']);
  });
  it('tapping a step opens that arrow', () => {
    const { onOpenStep, onChain } = setup();
    choose('alk', 'ald');
    fireEvent.click(screen.getByRole('button', { name: /^Alkenes → Alcohols → Aldehydes/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Alcohols → Aldehydes · 3 reactions/ }));
    expect(onOpenStep).toHaveBeenCalledWith('alc', 'ald');
    expect(onChain).toHaveBeenLastCalledWith([{ from: 'alk', to: 'alc' }, { from: 'alc', to: 'ald' }]); // a step row opens its reactions; the chosen chain stays
  });
  it('Swap exchanges the two families', () => {
    setup();
    choose('alk', 'alc');
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect((screen.getByRole('combobox', { name: 'From' }) as HTMLSelectElement).value).toBe('alc');
    expect((screen.getByRole('combobox', { name: 'To' }) as HTMLSelectElement).value).toBe('alk');
    expect(screen.getByText('No chain of 3 steps or fewer.')).toBeTruthy();
  });
  it('the same family twice is refused in words; a family with no way there says so', () => {
    setup();
    choose('alk', 'alk');
    expect(screen.getByText('Choose two different families.')).toBeTruthy();
    choose('alk', 'iso');
    expect(screen.getByText('No chain of 3 steps or fewer.')).toBeTruthy();
  });
  it('with an exam scope only chains whose reactions are inside it are listed (step 8.2b-fix, E4)', () => {
    // r5 (the direct Alkenes → Aldehydes arrow) is outside; only the two-step chain remains
    setup({ inScope: (id) => id !== 'r5', scopeName: 'JEE Main' });
    choose('alk', 'ald');
    const rows = [...screen.getByRole('list', { name: 'Chains' }).children];
    expect(rows.map((row) => row.querySelector('button')?.textContent)).toEqual(['Alkenes → Alcohols → Aldehydes On the map 2 steps · 4 reactions']);
  });
  it('when the only chain is outside the scope the panel says so and shows no chain', () => {
    setup({ inScope: (id) => id !== 'r1' && id !== 'r5', scopeName: 'JEE Main' });
    choose('alk', 'ald');
    expect(screen.getByText('No chain within JEE Main in 3 steps or fewer.')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Chains' })).toBeNull();
    expect(screen.queryByText(/Alkenes → /)).toBeNull();
  });
  it('with no chain anywhere the old words stay, also under a scope', () => {
    setup({ inScope: () => true, scopeName: 'JEE Main' });
    choose('alk', 'iso');
    expect(screen.getByText('No chain of 3 steps or fewer.')).toBeTruthy();
  });
  it('a card that is not chosen shows no step rows; choosing it shows them; one card is chosen at a time (step 8.3b, B2.1)', () => {
    setup();
    choose('alk', 'ald');
    const cards = [...screen.getByRole('list', { name: 'Chains' }).children] as HTMLElement[];
    expect(cards[0]?.getAttribute('data-picked')).not.toBeNull(); // the first by default
    expect(within(cards[0] as HTMLElement).getAllByRole('button')).toHaveLength(2); // its card button and its one step row
    expect(within(cards[1] as HTMLElement).getAllByRole('button')).toHaveLength(1); // not chosen: the card only, no step rows
    expect(within(cards[1] as HTMLElement).getByText('2 steps · 4 reactions')).toBeTruthy();
    fireEvent.click(within(cards[1] as HTMLElement).getByText('2 steps · 4 reactions')); // a click anywhere on the summary line chooses it
    expect(cards[1]?.getAttribute('data-picked')).not.toBeNull();
    expect(cards[0]?.getAttribute('data-picked')).toBeNull();
    expect(within(cards[1] as HTMLElement).getAllByRole('button')).toHaveLength(3); // the card button and two step rows
    expect(within(cards[1] as HTMLElement).getByText('On the map')).toBeTruthy();
    expect(within(cards[0] as HTMLElement).getAllByRole('button')).toHaveLength(1);
  });
  it('on a phone the peek shows the selects, the first chain card (with its steps, as on a wide screen) and "Show all"; Show all opens the rest (step 8.3b, B2.1)', () => {
    setup({ phone: true });
    choose('alk', 'ald');
    expect(screen.getAllByRole('list', { name: 'Chains' })[0]?.children).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2' }));
    expect(screen.getAllByRole('list', { name: 'Chains' })[0]?.children).toHaveLength(2);
  });
  it('Esc and Close close the panel, and closing clears the chain', () => {
    const { onClose, onChain } = setup();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    cleanup();
    expect(onChain).toHaveBeenLastCalledWith(undefined);
  });
});
