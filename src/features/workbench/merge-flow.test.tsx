// @vitest-environment jsdom
/** "Merge into..." (step 6.8a, D3): the picker of records of the SAME kind, then the merge dialog; with the record to keep already chosen (the duplicate dialog) the dialog opens at once. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { stubDialog } from '@/test-support/window-kit';
import type { MergePort } from './merge-contracts';
import { MergeFlow } from './merge-flow';

beforeAll(stubDialog);
afterEach(cleanup);

const B = { ref: { kind: 'species', id: 'spc_b' }, name: 'Diethyl ether' } as const;
const portOf = (): MergePort => ({
  candidates: vi.fn((_kind, text) => (text.toLowerCase().includes('eth') ? [B] : [])),
  preview: async () => ({ ok: true, scalars: [], filled: [], fromName: 'A', changes: [{ ref: B.ref, name: B.name }], deleted: undefined }),
  run: async () => ({ ok: true }),
});

describe('MergeFlow', () => {
  it('asks for the record to keep (same kind, by name), then shows the merge dialog for it', async () => {
    const port = portOf();
    render(<MergeFlow port={port} kind="species" kindWords="species" from={{ id: 'spc_a' }} exceptId="spc_a" onDone={() => undefined} onClose={() => undefined} />);
    const picker = screen.getByRole('dialog', { name: 'Merge into...' });
    fireEvent.change(within(picker).getByLabelText('Search for the species to keep'), { target: { value: 'eth' } });
    expect(port.candidates).toHaveBeenLastCalledWith('species', 'eth', 'spc_a');
    fireEvent.click(within(picker).getByRole('button', { name: 'Merge into Diethyl ether' }));
    expect(await screen.findByRole('dialog', { name: 'Merge into Diethyl ether' })).toBeTruthy();
  });
  it('with the record to keep given, the merge dialog opens at once', async () => {
    render(<MergeFlow port={portOf()} kind="species" kindWords="species" from={{ id: 'spc_a' }} exceptId="spc_a" into={B} onDone={() => undefined} onClose={() => undefined} />);
    expect(await screen.findByRole('dialog', { name: 'Merge into Diethyl ether' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Merge into...' })).toBeNull();
  });
  it('nothing found says so', () => {
    render(<MergeFlow port={portOf()} kind="species" kindWords="species" from={{}} exceptId="x" onDone={() => undefined} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Search for the species to keep'), { target: { value: 'zzz' } });
    expect(screen.getByText('No species found.')).toBeTruthy();
  });
});
