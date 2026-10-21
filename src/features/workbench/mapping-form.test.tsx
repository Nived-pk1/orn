// @vitest-environment jsdom
/**
 * The topic mapping editor (step 6.6c part 2, M2): topic, target and role start unchosen ("Choose a topic", "Choose a role"), the target
 * is picked from the kinds the reference registry allows, CUR-006 comes live from the real rule, and a seeded editor shows what was filled in.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge, type ShownKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = async (shown: ShownKnowledge): Promise<void> => {
  await act(async () => void shown.rig.ui.fireAfter(300));
  await act(async () => void shown.rig.ui.fireAfter(500));
};
const pickTarget = async (text: string, name: string): Promise<void> => {
  set('Find the target record by name', text);
  fireEvent.click(within(await screen.findByRole('list', { name: 'Records found' })).getByRole('button', { name: `Add ${name}` }));
};

describe('a new topic mapping', () => {
  it('has no topic, target or role; the topic and role start with "Choose ..."; the roles are in plain words; Save is refused', async () => {
    const { draft, rig } = showKnowledge('topic_mapping', { blank: true });
    for (const field of ['topicId', 'target', 'role']) expect(draft()).not.toHaveProperty(field);
    const topic = screen.getByLabelText('Topic') as HTMLSelectElement;
    expect(topic.value).toBe('');
    expect(within(topic).getAllByRole('option')[0]?.textContent).toBe('Choose a topic');
    expect(within(topic).getAllByRole('option')).toHaveLength(28);
    const role = screen.getByLabelText('Role') as HTMLSelectElement;
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a role', 'Core', 'Supporting', 'Enrichment']);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    expect(Object.keys(rig.store.getState().records.topic_mapping)).toHaveLength(31);
  });
  it('takes the topic, the target and the role into the draft', async () => {
    const { draft } = showKnowledge('topic_mapping', { blank: true });
    set('Topic', 'top_diazonium-chemistry');
    await pickTarget('Nitration', 'Nitration of benzene (draft)');
    set('Role', 'supporting');
    expect(draft()).toMatchObject({ topicId: 'top_diazonium-chemistry', role: 'supporting', target: { kind: 'reaction' } });
    expect(screen.getByRole('list', { name: 'Target record' }).textContent).toContain('Nitration of benzene (draft)');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Nitration of benzene (draft)' }));
    expect(draft()).not.toHaveProperty('target');
  });
  it('offers every kind the registry allows for a target, but not a route (no picker yet) and not a topic or a mapping', () => {
    showKnowledge('topic_mapping', { blank: true });
    expect(screen.getByText(/Routes cannot be chosen yet/)).toBeTruthy();
  });
});

describe('CUR-006', () => {
  it('the form says at once that the record is already in the topic through another mapping (the rule flags the LATER ID, so a duplicate of an older mapping may be the clean one)', async () => {
    showKnowledge('topic_mapping', { blank: true });
    set('Topic', 'top_alcohol-oxidation-dehydration');
    await pickTarget('1° alcohol', '1° alcohol → aldehyde (PCC)');
    expect(await screen.findByText(/Already in this topic through another mapping: core/)).toBeTruthy();
    set('Topic', 'top_diazonium-chemistry');
    await waitFor(() => expect(screen.queryByText(/Already in this topic through another mapping/)).toBeNull());
  });
  it('a second mapping of the same record to the same topic is a live warning from the real rule', async () => {
    const first = showKnowledge('topic_mapping', { blank: true, real: true });
    set('Topic', 'top_diazonium-chemistry');
    await pickTarget('Nitration', 'Nitration of benzene (draft)');
    set('Role', 'core');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.keys(first.rig.store.getState().records.topic_mapping)).toHaveLength(32));
    cleanup();
    const shown = showKnowledge('topic_mapping', { blank: true, real: true, rig: first.rig });
    set('Topic', 'top_diazonium-chemistry');
    await pickTarget('Nitration', 'Nitration of benzene (draft)');
    set('Role', 'supporting');
    await settle(shown);
    expect(await screen.findByText(/already placed in this topic by another mapping/)).toBeTruthy();
    set('Topic', 'top_alcohol-oxidation-dehydration');
    await settle(shown);
    await waitFor(() => expect(screen.queryByText(/already placed in this topic/)).toBeNull());
  });
});

describe('the title', () => {
  it('names the record and the topic once both are chosen, as the history label does', async () => {
    showKnowledge('topic_mapping', { blank: true });
    expect(screen.getByRole('heading', { name: 'New topic mapping' })).toBeTruthy();
    set('Topic', 'top_diazonium-chemistry');
    await pickTarget('Nitration', 'Nitration of benzene (draft)');
    expect(screen.getByRole('heading', { name: 'New topic mapping: Nitration of benzene (draft) in Diazonium salts' })).toBeTruthy();
  });
});

describe('a seeded mapping', () => {
  it('opens with the target (or the topic) already filled in, the rest still to choose', () => {
    const { draft } = showKnowledge('topic_mapping', { blank: true, seed: { target: { kind: 'reaction', id: 'rxn_aniline-diazotisation' } } });
    expect(screen.getByRole('list', { name: 'Target record' }).textContent).toContain('Diazotisation of aniline');
    expect(draft()).not.toHaveProperty('role');
    expect((screen.getByLabelText('Topic') as HTMLSelectElement).value).toBe('');
  });
  it('a topic seed fills the topic', () => {
    showKnowledge('topic_mapping', { blank: true, seed: { topicId: 'top_diazonium-chemistry' } });
    expect((screen.getByLabelText('Topic') as HTMLSelectElement).value).toBe('top_diazonium-chemistry');
  });
});
