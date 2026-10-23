// @vitest-environment jsdom
/**
 * The delete dialog (step 6.8a, D1): the impact in three lists BEFORE anything changes - "Removed from", "Deleted with it", "Blocks the
 * delete" - the first 10 of each with "Show all <n>", Delete unavailable (in words) while anything blocks, and the number of [[links]] left
 * behind. The impact itself is computed by the core; here the screen over a given view.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DeleteRow, DeleteView } from '@/core/editing';
import { stubDialog } from '@/test-support/window-kit';
import { DeleteDialog } from './delete-dialog';

beforeAll(stubDialog);
afterEach(cleanup);

const row = (n: number, fields: string[] = ['class list'], kind: DeleteRow['ref']['kind'] = 'species'): DeleteRow => ({ ref: { kind, id: `${kind === 'species' ? 'spc' : 'rxn'}_r${n}` } as DeleteRow['ref'], name: `Record ${n}`, fields });
const viewOf = (over: Partial<DeleteView> = {}): DeleteView => ({ targets: [{ ref: { kind: 'species', id: 'spc_x' }, name: 'Ethanol' }], removedFrom: [], deletedWith: [], blocks: [], softLinks: 0, canDelete: true, ...over });

function show(view: DeleteView, extra: { onDelete?: () => void; onOpen?: (ref: DeleteRow['ref']) => void; reason?: string; message?: string } = {}) {
  return render(<DeleteDialog view={view} reason={extra.reason} message={extra.message} onDelete={extra.onDelete ?? (() => undefined)} onOpen={extra.onOpen ?? (() => undefined)} onClose={() => undefined} />);
}
const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Delete Ethanol?' });
const list = (name: string): HTMLElement => within(dialog()).getByRole('list', { name });

describe('the three lists', () => {
  it('"Removed from" names each record with the field in words', () => {
    show(viewOf({ removedFrom: [row(1, ['class list', 'substance (participant 2)'])] }));
    expect(within(list('Removed from')).getByText(/Record 1/)).toBeTruthy();
    expect(list('Removed from').textContent).toContain('class list, substance (participant 2)');
  });
  it('"Deleted with it" names each record; "Blocks the delete" has an Open button for each', () => {
    const onOpen = vi.fn();
    show(viewOf({ deletedWith: [row(2, [], 'reaction')], blocks: [row(3, ['substance (participant 1)'], 'reaction')], canDelete: false }), { onOpen });
    expect(within(list('Deleted with it')).getByText(/Record 2/)).toBeTruthy();
    fireEvent.click(within(list('Blocks the delete')).getByRole('button', { name: 'Open Record 3' }));
    expect(onOpen).toHaveBeenCalledWith({ kind: 'reaction', id: 'rxn_r3' });
  });
  it('a list that is empty is not shown at all', () => {
    show(viewOf());
    expect(within(dialog()).queryByRole('list', { name: 'Removed from' })).toBeNull();
    expect(within(dialog()).queryByRole('list', { name: 'Deleted with it' })).toBeNull();
    expect(within(dialog()).queryByRole('list', { name: 'Blocks the delete' })).toBeNull();
    expect(dialog().textContent).toContain('Nothing else changes.');
  });
  it('the first 10 are shown and "Show all 14" shows the rest', () => {
    show(viewOf({ removedFrom: Array.from({ length: 14 }, (_, i) => row(i + 1)) }));
    expect(within(list('Removed from')).getAllByRole('listitem')).toHaveLength(10);
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Show all 14' }));
    expect(within(list('Removed from')).getAllByRole('listitem')).toHaveLength(14);
    expect(within(dialog()).queryByRole('button', { name: 'Show all 14' })).toBeNull();
  });
  it('10 or fewer have no "Show all"', () => {
    show(viewOf({ removedFrom: Array.from({ length: 10 }, (_, i) => row(i + 1)) }));
    expect(within(dialog()).queryByRole('button', { name: /^Show all/ })).toBeNull();
  });
});

describe('Delete', () => {
  it('runs the delete when nothing blocks', () => {
    const onDelete = vi.fn();
    show(viewOf({ removedFrom: [row(1)] }), { onDelete });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
  it('is unavailable while anything blocks, and says so in words', () => {
    const onDelete = vi.fn();
    show(viewOf({ blocks: [row(3, ['substance (participant 1)'], 'reaction')], canDelete: false }), { onDelete });
    const button = within(dialog()).getByRole('button', { name: 'Delete' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onDelete).not.toHaveBeenCalled();
    expect(dialog().textContent).toMatch(/cannot be deleted until none of them uses it/i);
  });
  it('is unavailable in a read-only tab with the reason', () => {
    show(viewOf(), { reason: 'This tab is read-only: edit in the tab that is saving' });
    expect(within(dialog()).getByRole('button', { name: 'Delete' }).getAttribute('aria-disabled')).toBe('true');
    expect(dialog().textContent).toContain('This tab is read-only');
  });
  it('says how many [[links]] are left as they are, and a refusal from the store in words', () => {
    show(viewOf({ softLinks: 3 }), { message: 'The delete was refused: something changed' });
    expect(dialog().textContent).toMatch(/3 links in the text of other records stay as they are and show as a missing record \(REF-008\)/);
    expect(within(dialog()).getByRole('alert').textContent).toContain('The delete was refused');
  });
  it('one link is singular', () => {
    show(viewOf({ softLinks: 1 }));
    expect(dialog().textContent).toMatch(/1 link in the text of another record stays as it is/);
  });
});
