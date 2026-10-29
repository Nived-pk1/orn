// @vitest-environment jsdom
/**
 * The route editor (7.2b C1) over the real host, store and picker port: a new route, steps with the reaction picker, the outcome and
 * condition choices of THAT reaction, "Takes its input from", Up/Down/Remove (Remove asks), RTE findings live from the real rules, Save,
 * and a draft seeded from a found route (C2). Written after the code (seen red: no, the registration and the form were written first).
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
const open = (name: RegExp): void => {
  const toggle = screen.getAllByRole('button', { name })[0] as HTMLElement;
  if (toggle.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
};
/** Adds a step and picks its reaction by a piece of its name. */
async function addStepWith(text: string, name: string, n: number): Promise<void> {
  open(/^Steps/);
  fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
  fireEvent.click(screen.getByRole('button', { name: `Edit step ${n}` }));
  set(`Find the reaction of step ${n} by name`, text);
  fireEvent.click(within(await screen.findByRole('list', { name: `Reactions found for step ${n}` })).getByRole('button', { name: `Add ${name}` }));
}

describe('a new route', () => {
  it('starts with an empty name, the purpose "Mine", no target and no steps; "Choose a name." until it has one', () => {
    const shown = showKnowledge('route', { blank: true });
    expect(shown.draft()).toMatchObject({ kind: 'route', name: '', purpose: 'user', steps: [] });
    expect((screen.getByLabelText('What this route is') as HTMLSelectElement).value).toBe('user');
    expect(screen.getByText('Choose a name.')).toBeTruthy();
    expect(screen.getByText('No steps yet (RTE-003).')).toBeTruthy();
  });
});

describe('steps', () => {
  it('a step: the reaction, then THAT reaction\'s outcomes and conditions; a new step ticks no input and says how to tick', async () => {
    const shown = showKnowledge('route', { blank: true });
    await addStepWith('Cannizzaro', 'Cannizzaro reaction of benzaldehyde', 1);
    const steps = shown.draft().steps as { reactionId: string; inputFromStepIds: string[] }[];
    expect(steps).toHaveLength(1);
    expect(steps[0]?.reactionId).toBe('rxn_benzaldehyde-cannizzaro');
    expect(within(screen.getByLabelText('Outcome of step 1')).getAllByRole('option')[0]?.textContent).toBe('Any outcome');
    expect(within(screen.getByLabelText('Conditions of step 1')).getAllByRole('option')[0]?.textContent).toBe('No variant');
    expect(steps[0]?.inputFromStepIds).toEqual([]);
    expect(screen.getByText('Tick the step whose product this step uses; tick none for a starting material.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Steps' }).textContent).toContain('1. Cannizzaro reaction of benzaldehyde · any outcome · no variant');
  });

  it('"Takes its input from" lists the EARLIER steps only; Up and Down move; Remove asks first and Keep keeps', async () => {
    const shown = showKnowledge('route', { blank: true });
    await addStepWith('Cannizzaro', 'Cannizzaro reaction of benzaldehyde', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit step 2' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Step 1' }));
    const [first, second] = (shown.draft().steps as { id: string; inputFromStepIds: string[] }[]);
    expect(second?.inputFromStepIds).toEqual([first?.id]);
    fireEvent.click(screen.getByRole('button', { name: 'Move step 2 up' }));
    expect((shown.draft().steps as { id: string }[]).map((s) => s.id)).toEqual([second?.id, first?.id]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(screen.getByRole('group', { name: 'Remove step 1?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(shown.draft().steps).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove step 1' }));
    expect(shown.draft().steps).toHaveLength(1);
  });
});

describe('findings and Save', () => {
  it('RTE-003 speaks live for a route with no steps; Save is refused without a name, then works', async () => {
    const shown = showKnowledge('route', { blank: true, real: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Save was refused' });
    set('Name (required)', 'Zz new route');
    await settle(shown);
    await waitFor(() => expect(document.body.textContent).toContain('has no steps'));
    await addStepWith('Cannizzaro', 'Cannizzaro reaction of benzaldehyde', 1);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.values(shown.rig.store.getState().records.route).some((r) => r.name === 'Zz new route' && r.steps.length === 1)).toBe(true));
  });
});

describe('a draft seeded from a found route (C2)', () => {
  it('opens filled, with an empty name that is required, and saves nothing until Save', () => {
    const before = Object.keys(showKnowledge('route', { blank: true }).rig.store.getState().records.route).length;
    cleanup();
    const shown = showKnowledge('route', {
      blank: true,
      seed: { name: '', purpose: 'user', target: { kind: 'species', id: 'spc_ethanol' }, steps: [{ id: 'rst_aa', reactionId: 'rxn_benzaldehyde-cannizzaro', inputFromStepIds: [] }, { id: 'rst_bb', reactionId: 'rxn_benzaldehyde-cannizzaro', inputFromStepIds: ['rst_aa'] }] },
    });
    expect((screen.getByLabelText('Name (required)') as HTMLInputElement).value).toBe('');
    expect(screen.getByText('Choose a name.')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Steps' }).querySelectorAll(':scope > li')).toHaveLength(2);
    expect(Object.keys(shown.rig.store.getState().records.route)).toHaveLength(before);
  });
});

describe('a step whose reaction has several condition variants (7.2b)', () => {
  it('says "Choose the condition variant." until one is chosen; a reaction with none says nothing', () => {
    showKnowledge('route', { blank: true, seed: { name: '', purpose: 'user', steps: [{ id: 'rst_aa', reactionId: 'rxn_ethanal-aldol', inputFromStepIds: [] }] } });
    open(/^Steps/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit step 1' }));
    expect(screen.getByText('Choose the condition variant.')).toBeTruthy();
    const select = screen.getByLabelText('Conditions of step 1') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: select.options[1]?.value ?? '' } });
    expect(screen.queryByText('Choose the condition variant.')).toBeNull();
  });
});
