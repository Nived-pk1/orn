// @vitest-environment jsdom
/**
 * The reaction editor's links section (step 6.6b part 3, decision N4): named reactions and transformations through pickers, reversibility
 * ("Not stated" for the schema's unknown; a new reaction starts there), the reversibility note, prerequisite concepts, difficulty, the
 * generalised equation as one-line text, and the atom-mapped reaction shown read-only and kept unchanged.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { editorRig } from '@/test-support/editor-kit';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { CanonicalState, Reaction } from '@/core/schema';

beforeAll(stubDialog);
afterEach(cleanup);

const DRAFT = 'rxn_benzene-nitration-draft'; // reversibility unknown, no links
const PCC = 'rxn_alcohol1-to-aldehyde-pcc'; // irreversible, a generalised equation
const ALDOL = 'rxn_ethanal-aldol'; // equilibrium with a note
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const open = (): void => {
  const toggle = screen.getAllByRole('button', { name: /Links and reversibility/ })[0] as HTMLElement;
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};
const withMapped = (): CanonicalState => {
  const state = demoState();
  const reaction = { ...state.records.reaction[PCC as never], mappedReaction: { format: 'reaction_smiles', value: '[CH3:1][OH:2]>>[CH3:1]=[O:2]' } } as Reaction;
  return { ...state, records: { ...state.records, reaction: { ...state.records.reaction, [PCC]: reaction } } } as CanonicalState;
};

describe('reversibility', () => {
  it('words the four values; the schema\'s unknown is "Not stated" and is where a reaction starts', () => {
    showKnowledge('reaction', { blank: true });
    open();
    const select = screen.getByLabelText('Reversibility') as HTMLSelectElement;
    expect(select.value).toBe('unknown');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not stated', 'Equilibrium', 'Reversible under other conditions', 'Irreversible']);
  });
  it('shows the stored value and note; the kind and the note are edited apart; an empty note removes it', () => {
    const { draft } = showKnowledge('reaction', { target: ALDOL });
    open();
    expect((screen.getByLabelText('Reversibility') as HTMLSelectElement).value).toBe('equilibrium');
    expect((screen.getByLabelText('Reversibility note') as HTMLTextAreaElement).value).toMatch(/retro-aldol/);
    set('Reversibility', 'irreversible');
    expect(draft().reversibility).toMatchObject({ kind: 'irreversible', note: expect.stringMatching(/retro-aldol/) });
    set('Reversibility note', '');
    expect(draft().reversibility).toEqual({ kind: 'irreversible' });
  });
});

describe('links', () => {
  it('adds a named reaction and a transformation through the pickers, and removes one', async () => {
    const { draft } = showKnowledge('reaction', { target: DRAFT });
    open();
    set('Find a named reaction by name', 'Cannizzaro');
    fireEvent.click(within(await screen.findByRole('list', { name: 'Named reactions found' })).getByRole('button', { name: 'Add Cannizzaro reaction' }));
    await waitFor(() => expect(draft().namedReactionIds).toEqual(['nrx_cannizzaro']));
    set('Find a transformation by name', 'Alcohol');
    const results = await screen.findByRole('list', { name: 'Transformations found' });
    fireEvent.click(within(results).getAllByRole('button')[0] as HTMLElement);
    await waitFor(() => expect((draft().transformationIds as string[]).length).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Cannizzaro reaction' }));
    expect(draft().namedReactionIds).toEqual([]);
  });
  it('adds a prerequisite concept in its own list', async () => {
    const { draft } = showKnowledge('reaction', { target: DRAFT });
    open();
    set('Find a prerequisite concept by name', 'Dehydration');
    fireEvent.click(within(await screen.findByRole('list', { name: 'Concepts found' })).getByRole('button', { name: 'Add Dehydration' }));
    await waitFor(() => expect(draft().prerequisiteConceptIds).toEqual(['cpt_dehydration']));
    expect(draft().conceptIds).not.toContain('cpt_dehydration');
  });
});

describe('difficulty, equation and the kept atom-mapped reaction', () => {
  it('difficulty is "Not set" or 1 to 5; the generalised equation is one-line text and empty removes it', () => {
    const { draft } = showKnowledge('reaction', { target: PCC });
    open();
    expect((screen.getByLabelText('Generalised equation') as HTMLInputElement).value).toBe('R–CH2OH → R–CHO');
    set('Generalised equation', 'R-CH2OH -> R-CHO (PCC)');
    expect(draft().generalizedEquation).toBe('R-CH2OH -> R-CHO (PCC)');
    set('Generalised equation', '');
    expect(draft()).not.toHaveProperty('generalizedEquation');
    set('Difficulty', '2');
    expect(draft().difficulty).toBe(2);
    set('Difficulty', '');
    expect(draft()).not.toHaveProperty('difficulty');
  });
  it('shows the atom-mapped reaction read-only and keeps it through an edit and a Save', async () => {
    const rig = editorRig({ state: withMapped() });
    const { draft } = showKnowledge('reaction', { target: PCC, rig });
    open();
    expect(screen.getByText('[CH3:1][OH:2]>>[CH3:1]=[O:2]')).toBeTruthy();
    expect(screen.getByText(/kept unchanged/)).toBeTruthy();
    set('Generalised equation', 'R-CH2OH -> R-CHO (edited)');
    expect(draft().mappedReaction).toEqual({ format: 'reaction_smiles', value: '[CH3:1][OH:2]>>[CH3:1]=[O:2]' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rig.store.getState().records.reaction[PCC as never]).toMatchObject({ generalizedEquation: 'R-CH2OH -> R-CHO (edited)', mappedReaction: { value: '[CH3:1][OH:2]>>[CH3:1]=[O:2]' } }));
  });
});
