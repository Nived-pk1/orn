// @vitest-environment jsdom
/**
 * The caveat editor (step 6.6b part 5, decision N6): the kind has no default ("Choose a kind"), the title is one line, the statement is
 * required rich text, importance is "Not set" or low / medium / high, targets are rows (a record through the picker and its role, "Choose
 * a role"), CAV-001 and CAV-002 come live from the real rules, and the trigger conditions are the SAME conditions form as a stage's.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge, type ShownKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = async (shown: ShownKnowledge): Promise<void> => {
  await act(async () => void shown.rig.ui.fireAfter(300)); // the live schema check first: it decides whether the dry run is asked
  await act(async () => void shown.rig.ui.fireAfter(500));
};
const open = (name: RegExp): void => {
  const toggle = screen.getAllByRole('button', { name })[0] as HTMLElement;
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};
const addTarget = async (text: string, name: string): Promise<void> => {
  open(/Targets/);
  set('Find a target record by name', text);
  fireEvent.click(within(await screen.findByRole('list', { name: 'Records found' })).getByRole('button', { name: `Add ${name}` }));
};

describe('a new caveat', () => {
  it('starts with no kind and no importance; the five kinds are in plain words; Save is refused until the required fields are given', async () => {
    const shown = showKnowledge('caveat', { blank: true });
    expect(shown.draft()).not.toHaveProperty('caveatKind');
    const select = screen.getByLabelText('Kind of caveat') as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a kind', 'Exception', 'Trap', 'Limitation', 'Common mistake', 'Special case']);
    expect((screen.getByLabelText('Importance') as HTMLSelectElement).value).toBe('');
    expect(within(screen.getByLabelText('Importance')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Not set', 'Low', 'Medium', 'High']);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    set('Kind of caveat', 'trap');
    set('Title (required)', 'Zz new caveat');
    set('Statement (required)', 'It does not work with tertiary alcohols.');
    await addTarget('Cannizzaro', 'Cannizzaro reaction of benzaldehyde');
    const role = screen.getByLabelText('Role of Cannizzaro reaction of benzaldehyde') as HTMLSelectElement;
    expect(role.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' }); // the role is required
    set('Role of Cannizzaro reaction of benzaldehyde', 'affected_reaction');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.values(shown.rig.store.getState().records.caveat).some((c) => c.title === 'Zz new caveat' && c.caveatKind === 'trap')).toBe(true));
  });
});

describe('targets', () => {
  it('words the six roles; a record and a role per row; the row can be removed', async () => {
    const shown = showKnowledge('caveat', { blank: true });
    await addTarget('Cannizzaro', 'Cannizzaro reaction of benzaldehyde');
    const role = screen.getByLabelText('Role of Cannizzaro reaction of benzaldehyde');
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a role', 'Affected reaction', 'Affected substrate', 'Affected product', 'Affected reagent', 'Affected mechanism', 'Context']);
    set('Role of Cannizzaro reaction of benzaldehyde', 'context');
    expect(shown.draft().targets).toEqual([{ ref: { kind: 'reaction', id: 'rxn_benzaldehyde-cannizzaro' }, as: 'context' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove target Cannizzaro reaction of benzaldehyde' }));
    expect(shown.draft().targets).toEqual([]);
  });
  it('CAV-001 and CAV-002 come live from the real rules', async () => {
    const shown = showKnowledge('caveat', { blank: true, real: true });
    set('Kind of caveat', 'trap');
    set('Title (required)', 'Zz live caveat');
    set('Statement (required)', 'A statement.');
    await settle(shown);
    expect(await screen.findByText(/"Zz live caveat" does not say what it applies to/)).toBeTruthy(); // CAV-001
    await addTarget('Cannizzaro', 'Cannizzaro reaction of benzaldehyde');
    set('Role of Cannizzaro reaction of benzaldehyde', 'affected_substrate');
    await settle(shown);
    expect(await screen.findByText(/Target 1 is a reaction, which does not fit the role "affected substrate"/)).toBeTruthy(); // CAV-002
    expect(screen.queryByText(/does not say what it applies to/)).toBeNull();
    set('Role of Cannizzaro reaction of benzaldehyde', 'affected_reaction');
    await settle(shown);
    await waitFor(() => expect(screen.queryByText(/does not fit the role/)).toBeNull());
  });
});

describe('trigger conditions', () => {
  it('open the SAME conditions form as a stage; an edit stores only that field; Remove takes the whole block out', () => {
    const shown = showKnowledge('caveat', { target: 'cav_pcc-stops-at-aldehyde' });
    open(/Trigger/);
    expect(screen.getByText('No trigger conditions.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit trigger conditions' }));
    const medium = screen.getByLabelText('Medium of the trigger') as HTMLSelectElement;
    fireEvent.change(medium, { target: { value: medium.options[1]?.value ?? '' } });
    const stored = shown.draft().triggerConditions as Record<string, unknown>;
    expect(stored.medium).toBe(medium.options[1]?.value);
    expect(stored.solventCharacter).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove trigger conditions' }));
    expect(shown.draft()).not.toHaveProperty('triggerConditions');
  });
});

describe('editing a demo caveat', () => {
  it('the statement, rule, trigger and explanation are rich text; importance and the title are edited; empty optional text is absent', () => {
    const shown = showKnowledge('caveat', { target: 'cav_pcc-stops-at-aldehyde' });
    expect((screen.getByLabelText('Title (required)') as HTMLInputElement).value).toBe('PCC stops at the aldehyde');
    set('Statement (required)', 'PCC does not over-oxidise a primary alcohol.');
    set('Importance', 'high');
    set('Explanation', 'No water, so no hydrate.');
    expect(shown.draft()).toMatchObject({ statement: 'PCC does not over-oxidise a primary alcohol.', importance: 'high', explanation: 'No water, so no hydrate.' });
    set('Explanation', '');
    set('Importance', '');
    expect(shown.draft()).not.toHaveProperty('explanation');
    expect(shown.draft()).not.toHaveProperty('importance');
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(3);
  });
  it('lists the targets with their roles in words', () => {
    showKnowledge('caveat', { target: 'cav_anti-markovnikov-peroxide' });
    open(/Targets/);
    expect((screen.getByLabelText('Role of Markovnikov\'s rule') as HTMLSelectElement).value).toBe('context');
  });
});
