// @vitest-environment jsdom
/**
 * The concept editor (step 6.6b part 2, decision N1): the kind of concept has no default ("Choose a kind", Save is refused until it is
 * chosen), the kind words come from the schema's names, parents are refused in words when they would make a cycle, difficulty is "Not set"
 * or 1 to 5, and the summary is rich text. Over the real store, session manager and cycle guards.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const PARENT = 'cpt_electrophilic-addition';
const CHILD = 'cpt_ade';
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const find = async (label: string | RegExp, text: string): Promise<HTMLElement> => {
  set(label, text);
  return screen.findByRole('list', { name: 'Concepts found' });
};

describe('a new concept', () => {
  it('starts with no kind: "Choose a kind", and Save is refused in the schema\'s words until one is chosen', async () => {
    const { rig, id, draft } = showKnowledge('concept', { blank: true });
    expect(draft()).not.toHaveProperty('conceptKind');
    expect((screen.getByLabelText('Kind of concept') as HTMLSelectElement).value).toBe('');
    expect(within(screen.getByLabelText('Kind of concept')).getByRole('option', { name: 'Choose a kind' })).toBeTruthy();
    set('Name (required)', 'Zz brand new concept');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    expect(Object.keys(rig.store.getState().records.concept)).not.toContain(String(draft().id));
    set('Kind of concept', 'rule');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.values(rig.store.getState().records.concept).some((c) => c.name === 'Zz brand new concept' && c.conceptKind === 'rule')).toBe(true));
    expect(rig.drafts.entry(id)).toBeUndefined();
  });
  it('words the kinds from the schema\'s names: underscores as spaces, first letter capital', () => {
    showKnowledge('concept', { blank: true });
    const options = within(screen.getByLabelText('Kind of concept')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('Reaction type');
    expect(options).toContain('Mechanism class');
    expect(options).toContain('Acidity basicity');
    expect(options).toContain('Qualitative test');
    expect(options).toHaveLength(16); // "Choose a kind" and the 15 kinds
  });
});

describe('editing a demo concept', () => {
  it('shows the stored kind and parents, and "Not set" for a missing difficulty; difficulty is a number 1 to 5 only', () => {
    const { draft } = showKnowledge('concept', { target: CHILD });
    expect((screen.getByLabelText('Kind of concept') as HTMLSelectElement).value).toBe('mechanism_class');
    expect(within(screen.getByRole('list', { name: 'Parent concepts' })).getByText(/Electrophilic addition/)).toBeTruthy();
    const select = screen.getByLabelText('Difficulty') as HTMLSelectElement;
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not set', '1', '2', '3', '4', '5']);
    set('Difficulty', '4');
    expect(draft().difficulty).toBe(4);
    set('Difficulty', '');
    expect(draft()).not.toHaveProperty('difficulty');
  });
  it('refuses the concept itself and a concept below it as a parent, with the reason and no button', async () => {
    showKnowledge('concept', { target: PARENT });
    let results = await find('Find a parent concept by name', 'Electrophilic addition');
    const own = within(results).getAllByRole('listitem').find((li) => /^Electrophilic addition \(/.test(li.textContent ?? '') && !/AdE/.test(li.textContent ?? '')) as HTMLElement;
    expect(own.textContent).toMatch(/Cannot be chosen: A concept cannot be its own parent/);
    expect(within(own).queryByRole('button')).toBeNull();
    results = await find('Find a parent concept by name', 'Electrophilic addition (AdE)');
    const below = within(results).getAllByRole('listitem').find((li) => /^Electrophilic addition \(AdE\)/.test(li.textContent ?? '')) as HTMLElement;
    expect(below.textContent).toMatch(/already below this concept, so it cannot be its parent: that would make a cycle/);
    expect(within(below).queryByRole('button')).toBeNull();
  });
  it('adds an allowed parent, lists it, and removes it', async () => {
    const { draft } = showKnowledge('concept', { target: CHILD });
    const results = await find('Find a parent concept by name', 'Addition');
    const row = within(results).getAllByRole('listitem').find((li) => /^Addition \(/.test(li.textContent ?? '')) as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Add Addition' }));
    await waitFor(() => expect(draft().parentIds).toContain('cpt_addition'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Addition' }));
    expect(draft().parentIds).not.toContain('cpt_addition');
  });
  it('edits the name, the aliases and the summary as text; an empty summary removes the field', () => {
    const { draft } = showKnowledge('concept', { target: CHILD });
    set('Name (required)', 'AdE renamed');
    fireEvent.click(screen.getByRole('button', { name: 'Add alias' }));
    set('Alias 1', 'electrophilic addn');
    expect(draft()).toMatchObject({ name: 'AdE renamed', aliases: ['electrophilic addn'] });
    set('Summary', 'The attack of an electrophile on a pi bond.');
    expect(draft().summary).toBe('The attack of an electrophile on a pi bond.');
    set('Summary', '');
    expect(draft()).not.toHaveProperty('summary');
  });
});
