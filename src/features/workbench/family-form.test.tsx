// @vitest-environment jsdom
/**
 * The map family editor (step 6.6c part 4, M4): a navigator anchor of a class. Label (optional), group (an existing one or a new one),
 * tone (fixed for an existing group, PRS-005; "Choose a tone" for a new one), order (a number; the hint names the families around it),
 * and the cell on a grid of the CURRENT arrangement (a taken cell is refused in words, PRS-004). One family per class (PRS-002).
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { showKnowledge, type ShownKnowledge } from '@/test-support/knowledge-kit';
import { demoState } from '@/test-support/app-boot-kit';
import { stubDialog } from '@/test-support/window-kit';

beforeAll(stubDialog);
afterEach(cleanup);

const CLASS = 'cls_acyl-halides';
const SEED = { target: { kind: 'class', id: CLASS } };
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const settle = async (shown: ShownKnowledge): Promise<void> => {
  await act(async () => void shown.rig.ui.fireAfter(300));
  await act(async () => void shown.rig.ui.fireAfter(500));
};
const cell = (column: number, row: number): HTMLElement => screen.getByRole('button', { name: new RegExp(`^Column ${column}, row ${row}:`) });

describe('a new map family', () => {
  it('opens with the class filled in; the label is optional (the class name is shown); only the order has a start (after the last)', () => {
    const { draft, rig } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    expect(screen.getByRole('list', { name: 'Class' }).textContent).toContain('Acyl halides');
    expect(screen.getByLabelText(/Label/)).toBeTruthy();
    expect(screen.getByText('The map shows the class name: Acyl halides.')).toBeTruthy();
    expect(draft().order).toBe(1);
    for (const field of ['cell', 'group', 'tone']) expect(draft()).not.toHaveProperty(field);
    expect(Object.keys(rig.store.getState().records.navigator_anchor)).toHaveLength(15);
  });
  it('the title names the family', () => {
    showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    expect(screen.getByRole('heading', { name: 'New map family: Acyl halides' })).toBeTruthy();
  });
});

describe('the group and the tone', () => {
  it('an existing group brings its tone, shown and not changeable here (PRS-005)', () => {
    const { draft } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    const group = screen.getByLabelText('Group') as HTMLSelectElement;
    expect(within(group).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a group', 'Halogen compounds', 'Hydrocarbons', 'Nitrogen compounds', 'Oxygen compounds', 'A new group...']);
    set('Group', 'Oxygen compounds');
    expect(draft()).toMatchObject({ group: 'Oxygen compounds', tone: 'green' });
    expect(screen.queryByLabelText('Tone')).toBeNull();
    expect(screen.getByText('Tone: green (the tone of the group Oxygen compounds; it is changed on its first family)')).toBeTruthy();
  });
  it('a new group asks for its name and "Choose a tone" (seven tones, in words)', () => {
    const { draft } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    set('Group', '__new');
    set('Name of the new group', 'Acid derivatives');
    expect(draft().group).toBe('Acid derivatives');
    const tone = screen.getByLabelText('Tone') as HTMLSelectElement;
    expect(within(tone).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a tone', 'Blue', 'Green', 'Amber', 'Violet', 'Teal', 'Rose', 'Slate']);
    set('Tone', 'rose');
    expect(draft().tone).toBe('rose');
  });
  it('a group typed with the name of an existing one is that group (its tone is brought, not a second tone)', () => {
    const { draft } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    set('Group', '__new');
    set('Name of the new group', 'Hydrocarbons');
    expect(draft().tone).toBe('blue');
    expect(screen.queryByLabelText('Tone')).toBeNull();
  });
});

describe('the order', () => {
  it('starts after the last family of the chosen group, until the person types one', () => {
    const { draft } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    set('Group', 'Oxygen compounds');
    const highest = Math.max(...Object.values(demoState().records.navigator_anchor as never as Record<string, { group?: string; order: number }>).filter((a) => a.group === 'Oxygen compounds').map((a) => a.order));
    expect(draft().order).toBe(highest + 1);
    set('Order', '40');
    set('Group', 'Hydrocarbons');
    expect(draft().order).toBe(40);
  });
  it('the hint names the families before and after it in its group', () => {
    showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    set('Group', 'Oxygen compounds');
    set('Order', '10.5');
    expect(screen.getByText('Before: Aldehydes (order 10). After: Ketones (order 11).')).toBeTruthy();
  });
});

describe('the cell grid', () => {
  it('shows the used rows and columns plus one free row and column, with each family\'s label in its cell', () => {
    showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    const grid = screen.getByRole('group', { name: 'Map cell' });
    expect(within(grid).getAllByRole('button')).toHaveLength(6 * 5); // columns 0-4 and one free (5), rows 0-3 and one free (4)
    expect(cell(1, 1).textContent).toContain('Alcohols');
    expect(cell(0, 2).textContent).toMatch(/free/);
  });
  it('a free cell is chosen by click and the draft has it; the chosen cell is marked', () => {
    const { draft } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    fireEvent.click(cell(0, 2));
    expect(draft().cell).toEqual({ column: 0, row: 2 });
    expect(cell(0, 2).getAttribute('aria-pressed')).toBe('true');
  });
  it('a free cell is also chosen with the keyboard (Enter and Space on the focused cell)', () => {
    const { draft } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    cell(3, 1).focus();
    fireEvent.keyDown(cell(3, 1), { key: 'Enter' });
    expect(draft().cell).toEqual({ column: 3, row: 1 });
  });
  it('a taken cell is refused in words and the draft is unchanged (PRS-004)', () => {
    const { draft } = showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    fireEvent.click(cell(1, 1));
    expect(draft()).not.toHaveProperty('cell');
    expect(screen.getByRole('alert').textContent).toBe('Column 1, row 1 already holds Alcohols. Choose a free cell.');
    expect(cell(1, 1).getAttribute('aria-disabled')).toBe('true');
  });
  it('without a cell the family is drawn in the row below the map, and the form says so', () => {
    showKnowledge('navigator_anchor', { blank: true, seed: SEED });
    expect(screen.getByText('No cell chosen: the map draws this family in the row below it.')).toBeTruthy();
  });
});

describe('one family per class and a stored family', () => {
  it('a second family for a class that has one is said at once (PRS-002 flags only the later ID, so the rule may not name the draft)', () => {
    showKnowledge('navigator_anchor', { blank: true, seed: { target: { kind: 'class', id: 'cls_alcohols' } } });
    expect(screen.getByText(/This class is already a map family \(Alcohols\)\. A second one is ignored by the map \(PRS-002 warns\)\./)).toBeTruthy();
  });
  it('PRS-002 and PRS-004 come from the real rules for a draft that is the later ID', async () => {
    const first = showKnowledge('navigator_anchor', { blank: true, real: true, seed: SEED });
    set('Order', '30');
    fireEvent.click(cell(0, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.keys(first.rig.store.getState().records.navigator_anchor)).toHaveLength(16));
    cleanup();
    const shown = showKnowledge('navigator_anchor', { blank: true, real: true, rig: first.rig, seed: SEED });
    set('Order', '31');
    await settle(shown);
    expect(await screen.findByText(/Another anchor for the same target takes precedence over this one/)).toBeTruthy();
  });
  it('a stored family opens with its values and its own cell is not "taken"', () => {
    const { draft } = showKnowledge('navigator_anchor', { target: 'anc_alcohols' });
    expect((screen.getByLabelText('Group') as HTMLSelectElement).value).toBe('Oxygen compounds');
    expect(cell(1, 1).getAttribute('aria-pressed')).toBe('true');
    expect(cell(1, 1).getAttribute('aria-disabled')).not.toBe('true');
    expect(draft().order).toBe(7);
  });
  it('"Remove from the map" asks for the Delete dialog of the family; the 6.6c "arrives with deleting" words are gone (step 6.8a, D2)', () => {
    const shown = showKnowledge('navigator_anchor', { target: 'anc_alcohols' });
    expect(screen.queryByText(/arrives with deleting/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Remove from the map' }));
    expect(shown.remove).toHaveBeenCalledWith({ kind: 'navigator_anchor', id: 'anc_alcohols' });
  });
  it('a family not saved yet has nothing to remove', () => {
    showKnowledge('navigator_anchor', { blank: true });
    expect(screen.queryByRole('button', { name: 'Remove from the map' })).toBeNull();
  });
});
