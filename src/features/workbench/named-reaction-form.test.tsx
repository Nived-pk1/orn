// @vitest-environment jsdom
/**
 * The named reaction editor (step 6.6b part 2, decision N2): name and aliases, summary and typical conditions as rich text, concepts and
 * prerequisite concepts through the picker, parents (cycle refused in words), difficulty "Not set" or 1 to 5, and "Used by": the reactions
 * that name it, derived and read-only, each with a way to open it in the inspector. Nothing is added for a transformation link: it lives on
 * the reaction.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const CANNIZZARO = 'nrx_cannizzaro';
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('a new named reaction', () => {
  it('has a name to type, no difficulty, and saves with only a name (the schema has no other required choice)', async () => {
    const { rig, draft } = showKnowledge('named_reaction', { blank: true });
    expect((screen.getByLabelText('Difficulty') as HTMLSelectElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    set('Name (required)', 'Zz new named reaction');
    expect(draft()).toMatchObject({ name: 'Zz new named reaction', parentIds: [], conceptIds: [], prerequisiteConceptIds: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.values(rig.store.getState().records.named_reaction).some((n) => n.name === 'Zz new named reaction')).toBe(true));
  });
});

describe('editing a demo named reaction', () => {
  it('shows the stored name, aliases and difficulty; renames; the typical conditions are rich text', () => {
    const { draft } = showKnowledge('named_reaction', { target: CANNIZZARO });
    expect((screen.getByLabelText('Name (required)') as HTMLInputElement).value).toBe('Cannizzaro reaction');
    expect((screen.getByLabelText('Difficulty') as HTMLSelectElement).value).toBe('3');
    set('Name (required)', 'Cannizzaro reaction (renamed)');
    set(/^Typical conditions/, 'Conc. NaOH, heat');
    expect(draft()).toMatchObject({ name: 'Cannizzaro reaction (renamed)', typicalConditions: 'Conc. NaOH, heat' });
    set(/^Typical conditions/, '');
    expect(draft()).not.toHaveProperty('typicalConditions');
  });
  it('adds a prerequisite concept through the picker, in its own list and not in the concepts', async () => {
    const { draft } = showKnowledge('named_reaction', { target: CANNIZZARO });
    set('Find a prerequisite concept by name', 'Dehydration');
    const results = await screen.findByRole('list', { name: 'Concepts found' });
    fireEvent.click(within(results).getByRole('button', { name: 'Add Dehydration' }));
    await waitFor(() => expect(draft().prerequisiteConceptIds).toContain('cpt_dehydration'));
    expect(within(screen.getByRole('list', { name: 'Prerequisite concepts' })).getByText(/Dehydration/)).toBeTruthy();
    expect(draft().conceptIds).not.toContain('cpt_dehydration');
  });
  it('shows "Used by": the reactions that name it, read-only, and opening one keeps the draft', () => {
    const { rig, openRecord, id } = showKnowledge('named_reaction', { target: CANNIZZARO });
    set('Name (required)', 'Cannizzaro reaction (edited)'); // an edited session is kept as a draft when the editor closes
    const used = screen.getByRole('list', { name: 'Used by' });
    expect(within(used).getByText(/Cannizzaro reaction of benzaldehyde/)).toBeTruthy();
    expect(within(used).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(used).getByRole('button', { name: 'Open Cannizzaro reaction of benzaldehyde in the inspector' }));
    expect(openRecord).toHaveBeenCalledWith({ kind: 'reaction', id: 'rxn_benzaldehyde-cannizzaro' });
    expect(rig.drafts.entry(id)).toBeDefined(); // closing the editor keeps the draft
  });
  it('says so when no reaction names it', () => {
    showKnowledge('named_reaction', { blank: true });
    expect(screen.getByText('No reaction names this one yet.')).toBeTruthy();
  });
  it('refuses the record itself as a parent, in words, with no button', async () => {
    showKnowledge('named_reaction', { target: CANNIZZARO });
    set('Find a parent named reaction by name', 'Cannizzaro');
    const results = await screen.findByRole('list', { name: 'Named reactions found' });
    expect(results.textContent).toMatch(/Cannot be chosen: A named reaction cannot be its own parent/);
    expect(within(results).queryByRole('button')).toBeNull();
  });
});
