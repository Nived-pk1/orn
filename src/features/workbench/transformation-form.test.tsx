// @vitest-environment jsdom
/**
 * The transformation editor (step 6.6b part 2, decision N3): name and aliases, from and to classes through the class picker, the
 * equation and bond-change texts, the carbon-chain change ("Not stated" and the seven values in plain words), concepts, rich texts, "Used
 * by", and the reaction SMARTS read-only and kept unchanged.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { editorRig } from '@/test-support/editor-kit';
import { showKnowledge } from '@/test-support/knowledge-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { CanonicalState, Transformation } from '@/core/schema';

beforeAll(stubDialog);
afterEach(cleanup);

const ID = 'trf_alcohol-to-alkene';
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });
const withSmarts = (): CanonicalState => {
  const state = demoState();
  const trf = { ...state.records.transformation[ID as never], reactionSmarts: '[C:1][OH]>>[C:1]=O' } as Transformation;
  return { ...state, records: { ...state.records, transformation: { ...state.records.transformation, [ID]: trf } } } as CanonicalState;
};

describe('a new transformation', () => {
  it('starts with empty class lists and no carbon-chain statement, and saves with a name', async () => {
    const { rig, draft } = showKnowledge('transformation', { blank: true });
    expect(draft()).toMatchObject({ fromClassIds: [], toClassIds: [], conceptIds: [] });
    expect((screen.getByLabelText('Carbon chain change') as HTMLSelectElement).value).toBe('');
    set('Name (required)', 'Zz new transformation');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.values(rig.store.getState().records.transformation).some((t) => t.name === 'Zz new transformation')).toBe(true));
  });
});

describe('editing a demo transformation', () => {
  it('lists the from and to classes, and adds one through the class picker', async () => {
    const { draft } = showKnowledge('transformation', { target: ID });
    expect(within(screen.getByRole('list', { name: 'From classes' })).getByText(/Alcohols/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'To classes' })).getByText(/Alkenes/)).toBeTruthy();
    set('Find a to class by name', 'Ethers');
    const results = await screen.findByRole('list', { name: 'Classes found' });
    fireEvent.click(within(results).getByRole('button', { name: 'Add Ethers' }));
    await waitFor(() => expect(draft().toClassIds).toContain('cls_ethers'));
  });
  it('words the carbon-chain change in plain words; "Not stated" removes the field', () => {
    const { draft } = showKnowledge('transformation', { target: ID });
    const options = within(screen.getByLabelText('Carbon chain change')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Not stated', 'Ascent', 'Descent', 'None', 'Cyclisation', 'Ring opening', 'Rearrangement', 'Unspecified']);
    set('Carbon chain change', 'ring_opening');
    expect(draft().carbonChainChange).toBe('ring_opening');
    set('Carbon chain change', '');
    expect(draft()).not.toHaveProperty('carbonChainChange');
  });
  it('edits the equation and the bond-change summary as one-line texts; empty removes the field', () => {
    const { draft } = showKnowledge('transformation', { target: ID });
    set('Equation text', 'R-CH2OH -> R-CH=CH2');
    set('Bond change summary', 'C-O breaks, C=C forms');
    expect(draft()).toMatchObject({ equationText: 'R-CH2OH -> R-CH=CH2', bondChangeSummary: 'C-O breaks, C=C forms' });
    set('Equation text', '');
    expect(draft()).not.toHaveProperty('equationText');
  });
  it('shows the reaction SMARTS read-only, kept unchanged by an edit and a Save', async () => {
    const rig = editorRig({ state: withSmarts() });
    const { draft } = showKnowledge('transformation', { target: ID, rig });
    expect(screen.getByText('[C:1][OH]>>[C:1]=O')).toBeTruthy();
    expect(screen.getByText(/kept unchanged/)).toBeTruthy();
    expect(screen.queryByDisplayValue('[C:1][OH]>>[C:1]=O')).toBeNull(); // not an input
    set('Name (required)', 'Alcohol to alkene (renamed)');
    expect(draft().reactionSmarts).toBe('[C:1][OH]>>[C:1]=O');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rig.store.getState().records.transformation[ID as never]).toMatchObject({ name: 'Alcohol to alkene (renamed)', reactionSmarts: '[C:1][OH]>>[C:1]=O' }));
  });
  it('shows "Used by": the reactions that name this transformation', () => {
    showKnowledge('transformation', { target: ID });
    const used = screen.getByRole('list', { name: 'Used by' });
    expect(within(used).getAllByRole('listitem').length).toBeGreaterThan(0);
  });
});
