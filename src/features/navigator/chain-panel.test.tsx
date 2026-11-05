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
    expect(within(rows[0] as HTMLElement).getByRole('button', { name: 'Alkenes → Aldehydes' })).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByRole('button', { name: 'Alkenes → Alcohols → Aldehydes' })).toBeTruthy();
    expect(onChain).toHaveBeenLastCalledWith([{ from: 'alk', to: 'ald' }]);
  });
  it('choosing the second row draws that chain; its steps say the reagent words or the number of reactions', () => {
    const { onChain } = setup();
    choose('alk', 'ald');
    fireEvent.click(screen.getByRole('button', { name: 'Alkenes → Alcohols → Aldehydes' }));
    expect(onChain).toHaveBeenLastCalledWith([
      { from: 'alk', to: 'alc' },
      { from: 'alc', to: 'ald' },
    ]);
    expect(screen.getByRole('button', { name: 'Alkenes → Alcohols: PCC' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Alcohols → Aldehydes: 3 reactions' })).toBeTruthy();
  });
  it('tapping a step opens that arrow', () => {
    const { onOpenStep } = setup();
    choose('alk', 'ald');
    fireEvent.click(screen.getByRole('button', { name: 'Alkenes → Alcohols → Aldehydes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alcohols → Aldehydes: 3 reactions' }));
    expect(onOpenStep).toHaveBeenCalledWith('alc', 'ald');
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
    expect(rows.map((row) => row.querySelector('button')?.textContent)).toEqual(['Alkenes → Alcohols → Aldehydes']);
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
  it('on a phone the peek shows the selects, the first chain row and "Show all" - no step lists; Show all opens the rest (step 8.2b-fix, E2)', () => {
    setup({ phone: true });
    choose('alk', 'ald');
    expect(screen.getAllByRole('listitem').filter((li) => li.closest('ul') !== null && li.closest('ul')?.getAttribute('class')?.includes('steps'))).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /→/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 2' }));
    expect(screen.getAllByRole('button', { name: /→/ }).length).toBeGreaterThan(2);
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
