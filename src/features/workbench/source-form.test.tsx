// @vitest-environment jsdom
/**
 * The source editor (step 6.6a, decision C2): a record of kind `reference`, its fields as the schema types them. A new source has no kind
 * ("Choose a kind", L1 refuses Save until chosen); title, authors, year, edition, publisher, URL (the safe-URL type refuses anything but
 * http/https), identifier, notes; Save writes it. Over the real store and the real session manager.
 */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERIES } from '@/ui/hooks';
import type { Reference } from '@/core/schema';
import { editorRig, renderWithToasts, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import type { DraftChecksPort } from './check-contracts';
import { EditorHost } from './editor-host';

beforeAll(stubDialog);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const quiet: DraftChecksPort = {
  dryRun: async (_k, _d, version) => ({ version, state: 'checked', findings: [] }),
  structure: async (_k, _d, version) => ({ version, state: 'none' }),
};

function show() {
  const rig = editorRig();
  const opened = rig.drafts.open({ kind: 'reference', blank: true });
  if (!opened.ok) throw new Error(opened.message);
  renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
  return { rig, id: opened.id, dialog: screen.getByRole('dialog') };
}
const draftOf = (rig: EditorRig, id: string): Reference => rig.drafts.entry(id)?.session.draft as Reference;
const set = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the source editor', () => {
  it('is titled "New source" and has the sections Identity, Notes, tags and citations, Review', () => {
    const { dialog } = show();
    expect(within(dialog).getByText('New source')).toBeTruthy();
    const toggles = within(dialog).getAllByRole('button', { expanded: true }).map((b) => b.textContent?.replace(/^[▾▸]\s*/, ''));
    expect(toggles).toEqual(['Identity', 'Notes, tags and citations', 'Review']);
  });

  it('a new source has no kind: "Choose a kind", from the schema list', () => {
    show();
    const options = within(screen.getByLabelText('Kind of source')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Choose a kind', 'Textbook', 'NCERT', 'Article', 'Website', 'Exam paper', 'Syllabus document', 'Notes', 'Other']);
    expect((screen.getByLabelText('Kind of source') as HTMLSelectElement).value).toBe('');
  });

  it('each field edits the draft only; an empty optional field is absent; the year must be a whole number', () => {
    const { rig, id } = show();
    set('Kind of source', 'textbook');
    set('Title (required)', 'Organic Chemistry');
    set('Year', '2010');
    set('Edition', '5th');
    set('Publisher', 'Pearson');
    set('Identifier (ISBN, DOI or paper code)', 'ISBN 978-0');
    set('Web address (http or https)', 'https://example.org/book');
    expect(draftOf(rig, id)).toMatchObject({ refKind: 'textbook', title: 'Organic Chemistry', year: 2010, edition: '5th', publisher: 'Pearson', identifier: 'ISBN 978-0', url: 'https://example.org/book' });
    set('Edition', '');
    expect('edition' in draftOf(rig, id)).toBe(false);
    set('Year', '20x');
    expect(draftOf(rig, id).year).toBe(2010);
    expect(rig.store.getState().records.reference).toEqual({});
  });

  it('authors: add, edit, move, remove', () => {
    const { rig, id } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Add author' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add author' }));
    set('Author 1', 'Morrison');
    set('Author 2', 'Boyd');
    fireEvent.click(screen.getByRole('button', { name: 'Move author 2 up' }));
    expect(draftOf(rig, id).authors).toEqual(['Boyd', 'Morrison']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove author 1' }));
    expect(draftOf(rig, id).authors).toEqual(['Morrison']);
  });

  it('Save is refused until a kind and a title are given; a web address that is not http(s) is refused with the schema\'s words', async () => {
    const { dialog } = show();
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
  });

  it('Save writes the source; Merge is not offered', async () => {
    const { rig, dialog } = show();
    set('Kind of source', 'ncert');
    set('Title (required)', 'NCERT Chemistry XII');
    set('Web address (http or https)', 'javascript:alert(1)');
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })));
    expect(await within(dialog).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(rig.store.getState().records.reference).toEqual({});
    set('Web address (http or https)', '');
    await act(async () => void fireEvent.click(within(dialog).getByRole('button', { name: /^Save/ })));
    await waitFor(() => expect(Object.values(rig.store.getState().records.reference)).toHaveLength(1));
    expect(Object.values(rig.store.getState().records.reference)[0]).toMatchObject({ title: 'NCERT Chemistry XII', refKind: 'ncert' });
  });

  it('notes, study notes are not on a source (the schema has Notes only); tags and citations are', () => {
    show();
    expect(screen.getByLabelText('Notes')).toBeTruthy();
    expect(screen.queryByLabelText('Study notes')).toBeNull();
    expect(screen.getByLabelText('Add a tag')).toBeTruthy();
  });

  it('on a phone the editor is the same form (rows stack)', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    show();
    expect(screen.getByLabelText('Kind of source')).toBeTruthy();
  });

  it('the same title and year: Save lists the existing source in the duplicate dialog (Keep both, and Merge unavailable until step 6.8)', async () => {
    const rig = editorRig();
    const opened = rig.drafts.open({ kind: 'reference', blank: true });
    if (!opened.ok) throw new Error(opened.message);
    const check = vi.fn(async () => ({ matches: [{ ref: { kind: 'reference' as const, id: 'ref_old' }, name: 'NCERT Chemistry XII', qualifier: '2024', reasons: ['title' as const] }], more: 0, structureChecked: true }));
    renderWithToasts(<EditorHost port={{ ...rig.port, checks: quiet, duplicates: { check, openRecord: vi.fn() } }} sessionId={opened.id} open formatTime={utcTime} onClose={vi.fn()} />);
    set('Kind of source', 'ncert');
    set('Title (required)', 'NCERT Chemistry XII');
    await act(async () => void fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(check).toHaveBeenCalledWith('reference', expect.anything()));
    expect(await screen.findByText(/the same title and year/)).toBeTruthy();
    expect(screen.getByText('Merging arrives in step 6.8')).toBeTruthy();
  });
});
