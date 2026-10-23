// @vitest-environment jsdom
/**
 * The merge dialog (step 6.8a, D3): A is merged INTO B (B survives). Each scalar field where they differ shows both values with B's value
 * selected first ("Keep ..." / "Take ..."); the impact lists every record that will change; a refusal (different structures) is said in words
 * and Merge is unavailable; nothing changes before Merge. The core made the preview; here the screen over a fake port.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { stubDialog } from '@/test-support/window-kit';
import type { MergePort, MergeView } from './merge-contracts';
import { MergeDialog } from './merge-dialog';

beforeAll(stubDialog);
afterEach(cleanup);

const INTO: RecordRef = { kind: 'species', id: 'spc_b' };
const READY: MergeView = {
  ok: true,
  scalars: [
    { path: 'notes', into: 'Original note.', from: 'Twin note.' },
    { path: 'structure', into: undefined, from: { format: 'smiles', value: 'CCOCC' } },
  ],
  changes: [
    { ref: { kind: 'class', id: 'cls_x' }, name: 'Ethers' },
    { ref: INTO, name: 'Diethyl ether' },
  ],
  deleted: { ref: { kind: 'species', id: 'spc_a' }, name: 'Ethoxyethane (twin)' },
};
const portOf = (view: MergeView, run: MergePort['run'] = async () => ({ ok: true })): MergePort => ({ candidates: () => [], preview: async () => view, run });

function show(port: MergePort, onDone = vi.fn()) {
  render(<MergeDialog port={port} from={{ id: 'spc_a' }} into={INTO} intoName="Diethyl ether" onDone={onDone} onClose={() => undefined} />);
  return onDone;
}
const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Merge into Diethyl ether' });

describe('the review', () => {
  it('each differing scalar shows both values, B\'s selected first; an absent value is said', async () => {
    show(portOf(READY));
    const notes = await within(dialog()).findByRole('group', { name: 'notes' });
    const keep = within(notes).getByRole('radio', { name: /Keep Original note\./ }) as HTMLInputElement;
    const take = within(notes).getByRole('radio', { name: /Take Twin note\./ }) as HTMLInputElement;
    expect(keep.checked).toBe(true);
    expect(take.checked).toBe(false);
    const structure = within(dialog()).getByRole('group', { name: 'structure' });
    expect(within(structure).getByRole('radio', { name: /Keep \(nothing\)/ })).toBeTruthy();
    expect(within(structure).getByRole('radio', { name: /Take .*CCOCC/ })).toBeTruthy();
  });
  it('lists every record that will change, and the one that is deleted', async () => {
    show(portOf(READY));
    const list = await within(dialog()).findByRole('list', { name: 'Records that will change' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Ethers'), expect.stringContaining('Diethyl ether')]));
    expect(dialog().textContent).toContain('Ethoxyethane (twin) is deleted');
  });
  it('a merge with nothing to choose says so', async () => {
    show(portOf({ ok: true, scalars: [], changes: [{ ref: INTO, name: 'Diethyl ether' }], deleted: undefined }));
    expect(await within(dialog()).findByText('No field differs: nothing to choose.')).toBeTruthy();
  });
});

describe('Merge', () => {
  it('sends the picks (default keep B, a changed field take) and reports done', async () => {
    const run = vi.fn(async () => ({ ok: true as const }));
    const onDone = show(portOf(READY, run));
    const notes = await within(dialog()).findByRole('group', { name: 'notes' });
    fireEvent.click(within(notes).getByRole('radio', { name: /Take Twin note\./ }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(INTO));
    expect(run).toHaveBeenCalledWith({ id: 'spc_a' }, INTO, { notes: 'take', structure: 'keep' });
  });
  it('a refusal from the store is said in words and the dialog stays', async () => {
    const onDone = show(portOf(READY, async () => ({ ok: false, message: 'The merge was refused: something changed' })));
    await within(dialog()).findByRole('group', { name: 'notes' });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Merge' }));
    expect((await within(dialog()).findByRole('alert')).textContent).toContain('The merge was refused');
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('a refused merge', () => {
  it('says why in words, Merge is unavailable and nothing is listed', async () => {
    const run = vi.fn();
    show(portOf({ ok: false, message: 'These structures are different compounds' }, run));
    const said = await within(dialog()).findAllByText('These structures are different compounds');
    expect(said.some((one) => one.getAttribute('role') === 'status')).toBe(true);
    const merge = within(dialog()).getByRole('button', { name: 'Merge' });
    expect(merge.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(merge);
    expect(run).not.toHaveBeenCalled();
    expect(within(dialog()).queryByRole('list', { name: 'Records that will change' })).toBeNull();
  });
});
