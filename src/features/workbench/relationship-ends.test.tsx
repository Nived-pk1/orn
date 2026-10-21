// @vitest-environment jsdom
/**
 * A relationship names both ends in its title and history label (step 6.6c part A, L3) and an existing route end shows the route's
 * NAME with "(route)", never its ID (L4).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';
import { RELATIONSHIP_TYPE_SPECS } from '@/core/schema';

beforeAll(stubDialog);
afterEach(cleanup);

const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const pick = async (end: 'from' | 'to', text: string, name: string): Promise<void> => {
  set(`Find the ${end} record by name`, text);
  const results = await screen.findByRole('list', { name: 'Records found' });
  fireEvent.click(within(results).getByRole('button', { name: `Add ${name}` }));
};

describe('the title', () => {
  it('is "New relationship" until the type and both ends are chosen, then names both', async () => {
    showKnowledge('relationship', { blank: true });
    expect(screen.getByRole('heading', { name: 'New relationship' })).toBeTruthy();
    set('Type of relationship', 'prerequisite_of');
    await pick('from', 'Inductive', 'Inductive effect');
    expect(screen.getByRole('heading', { name: 'New relationship' })).toBeTruthy();
    await pick('to', 'Markovnikov', "Markovnikov's rule");
    expect(screen.getByRole('heading', { name: "New relationship: Inductive effect prerequisite of Markovnikov's rule" })).toBeTruthy();
  });
  it('of a stored relationship names both ends', () => {
    showKnowledge('relationship', { target: 'rel_cannizzaro-aldol-confusion' });
    expect(screen.getByRole('heading', { name: 'Edit relationship: Cannizzaro reaction of benzaldehyde commonly confused with Aldol reaction of ethanal' })).toBeTruthy();
  });
});

describe('the history label', () => {
  it('of a new relationship is "Create relationship: <A> <type> <B>"', async () => {
    const { rig } = showKnowledge('relationship', { blank: true });
    set('Type of relationship', 'commonly_confused_with');
    await pick('from', 'Cannizzaro', 'Cannizzaro reaction of benzaldehyde');
    await pick('to', 'Aldol', 'Aldol reaction of ethanal');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rig.store.historyLabels().undo.at(-1)).toBe('Create relationship: Cannizzaro reaction of benzaldehyde commonly confused with Aldol reaction of ethanal'));
  });
});

describe('a route end', () => {
  it("shows the route's name with \"(route)\", never its ID", () => {
    const { rig, id } = showKnowledge('relationship', { blank: true });
    const route = Object.values(rig.store.getState().records.route)[0];
    if (route === undefined) throw new Error('the demo has no route');
    const type = (Object.keys(RELATIONSHIP_TYPE_SPECS) as (keyof typeof RELATIONSHIP_TYPE_SPECS)[]).find((t) => (RELATIONSHIP_TYPE_SPECS[t].endpointKinds as readonly string[]).includes('route'));
    expect(type).toBeDefined();
    act(() => {
      rig.drafts.edit(id, (d) => {
        d.type = type;
        d.from = { kind: 'route', id: route.id };
      });
    });
    const list = screen.getByRole('list', { name: 'From record' });
    expect(list.textContent).toContain(`${route.name} (route)`);
    expect(list.textContent).not.toContain(route.id);
  });
});
