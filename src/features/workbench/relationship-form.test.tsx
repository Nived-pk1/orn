// @vitest-environment jsdom
/**
 * The relationship editor (step 6.6b part 4, decision N5): the type has no default ("Choose a type", nine types in plain words), each end
 * is picked from the records the type allows, a symmetric type reads "A <-> B" and a directed one "A -> B" with Swap, the reverse kind
 * exists only for "reverse of" (and a stray one is shown with a way to remove it, never dropped silently), a record cannot be related to
 * itself. Over the real store, session manager and picker port.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = async (end: 'from' | 'to', text: string, name: string): Promise<void> => {
  set(`Find the ${end} record by name`, text);
  const results = await screen.findByRole('list', { name: 'Records found' });
  fireEvent.click(within(results).getByRole('button', { name: `Add ${name}` }));
};

describe('a new relationship', () => {
  it('has no type; the nine types are in plain words; the ends wait for a type; Save is refused until all are given', async () => {
    const { rig, draft } = showKnowledge('relationship', { blank: true });
    expect(draft()).not.toHaveProperty('type');
    const select = screen.getByLabelText('Type of relationship') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Choose a type',
      'Alternative to',
      'Competes with',
      'Reverse of',
      'Commonly confused with',
      'Mechanistically related to',
      'Prerequisite of',
      'Typically follows',
      'Contrasts with',
      'Related to',
    ]);
    expect(screen.getAllByText(/Choose a type first/)).toHaveLength(2); // one per end
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    expect(Object.keys(rig.store.getState().records.relationship)).toHaveLength(13);
  });
});

describe('the ends', () => {
  it('are limited to the type\'s kinds: a species cannot be a prerequisite, but can be commonly confused', async () => {
    showKnowledge('relationship', { blank: true });
    set('Type of relationship', 'prerequisite_of');
    set('Find the from record by name', 'Ethanol');
    await waitFor(() => expect(screen.getByText('No record matches.')).toBeTruthy());
    set('Find the from record by name', 'Carbocation');
    expect(await screen.findByRole('list', { name: 'Records found' })).toBeTruthy();
    set('Type of relationship', 'commonly_confused_with');
    set('Find the from record by name', 'Ethanol');
    const results = await screen.findByRole('list', { name: 'Records found' });
    expect(within(results).getAllByRole('listitem').some((li) => /Ethanol \(/.test(li.textContent ?? ''))).toBe(true);
  });
  it('a symmetric type reads "A <-> B" with no Swap; a directed one "A -> B" with Swap, which swaps', async () => {
    const { draft } = showKnowledge('relationship', { blank: true });
    set('Type of relationship', 'prerequisite_of');
    await pick('from', 'Inductive', 'Inductive effect');
    await pick('to', 'Markovnikov', 'Markovnikov\'s rule');
    expect(screen.getByText('Inductive effect -> Markovnikov\'s rule')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(screen.getByText('Markovnikov\'s rule -> Inductive effect')).toBeTruthy();
    expect((draft().from as { id: string }).id).toBe('cpt_markovnikov');
    set('Type of relationship', 'related_to');
    expect(screen.getByText('Markovnikov\'s rule <-> Inductive effect')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Swap' })).toBeNull();
  });
  it('refuses the other end as this end, in words, with no button', async () => {
    showKnowledge('relationship', { blank: true });
    set('Type of relationship', 'related_to');
    await pick('from', 'Inductive', 'Inductive effect');
    set('Find the to record by name', 'Inductive');
    const results = await screen.findByRole('list', { name: 'Records found' });
    expect(results.textContent).toMatch(/Cannot be chosen: A record cannot be related to itself/);
  });
});

describe('the reverse kind', () => {
  it('exists only for "reverse of": hidden for other types, "Choose" with the schema\'s three words for reverse_of', () => {
    const { draft } = showKnowledge('relationship', { blank: true });
    set('Type of relationship', 'related_to');
    expect(screen.queryByLabelText('Reverse kind')).toBeNull();
    set('Type of relationship', 'reverse_of');
    const select = screen.getByLabelText('Reverse kind') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a reverse kind', 'Microscopic (the exact reverse)', 'Synthetic (a different reaction achieving the reverse change)', 'Conceptual (taught as opposites)']);
    set('Reverse kind', 'synthetic');
    expect(draft().reverseKind).toBe('synthetic');
  });
  it('a reverse kind left on another type is shown with the reason and removed only by the person', () => {
    const { draft } = showKnowledge('relationship', { blank: true });
    set('Type of relationship', 'reverse_of');
    set('Reverse kind', 'conceptual');
    set('Type of relationship', 'related_to');
    expect(screen.getByText(/Only "reverse of" has a reverse kind/)).toBeTruthy();
    expect(draft().reverseKind).toBe('conceptual'); // nothing dropped silently
    set('Reverse kind', '');
    expect(draft()).not.toHaveProperty('reverseKind');
    expect(screen.queryByLabelText('Reverse kind')).toBeNull();
  });
});

describe('editing a demo relationship', () => {
  it('shows the type and both ends in words, and edits the note', () => {
    const { draft } = showKnowledge('relationship', { target: 'rel_cannizzaro-aldol-confusion' });
    expect((screen.getByLabelText('Type of relationship') as HTMLSelectElement).value).toBe('commonly_confused_with');
    expect(screen.getByText('Cannizzaro reaction of benzaldehyde <-> Aldol reaction of ethanal')).toBeTruthy();
    set('Note', 'Both start from an aldehyde.');
    expect(draft().note).toBe('Both start from an aldehyde.');
  });
});
