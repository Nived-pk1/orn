// @vitest-environment jsdom
/** The duplicate check on Save (step 6.2a part 5): the dialog, its three buttons, no dialog without a match, the chem worker down. */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { editorRig, renderWithToasts, speciesOf, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DuplicateOutcome, DuplicatePort } from './duplicate-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(cleanup);

const ETHANOL_MATCH = { ref: { kind: 'species', id: 'spc_ethanol' }, name: 'Ethanol', formula: 'C2H5OH', structure: { format: 'smiles', value: 'CCO' }, reasons: ['name', 'structure'] } as const;
const one = (over: Partial<DuplicateOutcome> = {}): DuplicateOutcome => ({ matches: [ETHANOL_MATCH], more: 0, structureChecked: true, ...over });

function show(outcome: DuplicateOutcome) {
  const rig: EditorRig = editorRig();
  const id = rig.open();
  const openRecord = vi.fn();
  const check = vi.fn(async () => outcome);
  const duplicates: DuplicatePort = { check, openRecord };
  const onClose = vi.fn();
  renderWithToasts(<EditorHost port={{ ...rig.port, duplicates }} sessionId={id} open onClose={onClose} />);
  fireEvent.change(screen.getByLabelText('Canonical name (required)'), { target: { value: 'A changed name' } });
  return { rig, id, check, openRecord, onClose };
}
const save = (): void => void fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const dupDialog = () => screen.findByRole('dialog', { name: 'This may already exist' });

describe('on Save of a species', () => {
  it('shows each match with its name, formula and why it matched, and offers Open the existing, Keep both and Merge (unavailable)', async () => {
    const { check } = show(one());
    save();
    const dialog = await dupDialog();
    expect(check).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText('Ethanol')).toBeTruthy();
    expect(within(dialog).getByText(/C2H5OH/)).toBeTruthy();
    expect(within(dialog).getByText('Matched by the same name and the same structure.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Open Ethanol' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Keep both' })).toBeTruthy();
    const merge = within(dialog).getByRole('button', { name: 'Merge', description: 'Merging arrives in step 6.8' });
    expect(merge.getAttribute('aria-disabled')).toBe('true');
  });

  it('Open the existing: the draft stays a draft (nothing stored changed), the editor closes and the record is shown', async () => {
    const { rig, id, openRecord, onClose } = show(one());
    const before = rig.store.getState();
    save();
    fireEvent.click(within(await dupDialog()).getByRole('button', { name: 'Open Ethanol' }));
    expect(openRecord).toHaveBeenCalledWith({ kind: 'species', id: 'spc_ethanol' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(rig.drafts.entry(id)).toBeDefined(); // kept
    expect(rig.store.getState()).toBe(before);
  });

  it('Keep both: the Save goes on (the store\'s gate runs) and the record is saved', async () => {
    const { rig, id, onClose, check } = show(one());
    save();
    fireEvent.click(within(await dupDialog()).getByRole('button', { name: 'Keep both' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(check).toHaveBeenCalledTimes(1); // asked once, not again after the answer
    expect(speciesOf(rig, rig.speciesId).names.canonical).toBe('A changed name');
    expect(rig.drafts.entry(id)).toBeUndefined();
  });

  it('Back to the editor (or Esc) keeps everything as it was', async () => {
    const { rig, onClose } = show(one());
    save();
    fireEvent.click(within(await dupDialog()).getByRole('button', { name: 'Back to the editor' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'This may already exist' })).toBeNull());
    expect(onClose).not.toHaveBeenCalled();
    expect(rig.store.getRevision()).toBe(0);
  });

  it('no match: no dialog, the Save simply goes on', async () => {
    const { rig, onClose } = show({ matches: [], more: 0, structureChecked: true });
    save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole('dialog', { name: 'This may already exist' })).toBeNull();
    expect(speciesOf(rig, rig.speciesId).names.canonical).toBe('A changed name');
  });

  it('the chemistry worker down: the dialog says "Structure duplicates could not be checked" and Keep both is offered', async () => {
    show(one({ structureChecked: false, message: 'Structure duplicates could not be checked: the structure toolkit is not available' }));
    save();
    const dialog = await dupDialog();
    expect(within(dialog).getByRole('status').textContent).toMatch(/^Structure duplicates could not be checked: the structure toolkit is not available\. Only the names were compared\./);
    expect(within(dialog).getByRole('button', { name: 'Keep both' })).toBeTruthy();
  });

  it('the chemistry worker down and no name match: the Save goes on and a warning toast says so', async () => {
    const { onClose } = show({ matches: [], more: 0, structureChecked: false, message: 'x' });
    save();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText('Structure duplicates could not be checked')).toBeTruthy();
  });

  it('a draft that fails the schema is not checked for duplicates (L1 first); the refusal comes from the store', async () => {
    const rig = editorRig();
    const id = rig.open();
    const check = vi.fn(async () => one());
    renderWithToasts(<EditorHost port={{ ...rig.port, duplicates: { check, openRecord: vi.fn() } }} sessionId={id} open onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Canonical name (required)'), { target: { value: '' } });
    save();
    expect(await screen.findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(check).not.toHaveBeenCalled();
  });
});
