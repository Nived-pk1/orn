// @vitest-environment jsdom
/** The editor host (ADR-040, step 6.1a part 4): the form, list editing, the draft's own undo and redo and their keys, live findings, Save, refusals, conflicts. */
import { utcTime } from '@/test-support/editing-kit';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { changeElsewhere, editorRig, renderWithToasts, speciesOf, type EditorRig } from '@/test-support/editor-kit';
import { stubDialog } from '@/test-support/window-kit';
import { EditorHost } from './editor-host';
import { setCanonical } from './names-model';

beforeAll(stubDialog);
afterEach(cleanup);

function show(rig: EditorRig = editorRig()) {
  const id = rig.open();
  const onClose = vi.fn();
  renderWithToasts(<EditorHost port={rig.port} sessionId={id} open formatTime={utcTime} onClose={onClose} />);
  return { rig, id, onClose, dialog: screen.getByRole('dialog') };
}
const draftNames = (rig: EditorRig, id: string) => (rig.drafts.entry(id)?.session.draft as { names: { canonical: string; aliases: string[]; display?: string } }).names;
const type = (label: string | RegExp, value: string): void => void fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('the form', () => {
  it('is a dialog named for the record, with canonical, display, IUPAC, qualifier and the two lists, and the draft\'s own Undo and Redo', () => {
    const { rig, dialog } = show();
    const name = speciesOf(rig).names.canonical;
    expect(within(dialog).getByRole('heading', { name: `Edit ${name}` })).toBeTruthy();
    expect((within(dialog).getByLabelText('Canonical name (required)') as HTMLInputElement).value).toBe(name);
    for (const label of [/Display name/, /IUPAC name/, /Qualifier/]) expect(within(dialog).getByLabelText(label)).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Common names' })).toBeTruthy();
    expect(within(dialog).getByRole('group', { name: 'Aliases' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Undo' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(dialog).getByRole('button', { name: 'Redo' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('typing changes the DRAFT only: the stored record is untouched until Save', () => {
    const { rig, id } = show();
    const before = speciesOf(rig).names.canonical;
    type('Canonical name (required)', 'Propan-2-one');
    expect(draftNames(rig, id).canonical).toBe('Propan-2-one');
    expect(speciesOf(rig).names.canonical).toBe(before);
    expect(rig.store.getRevision()).toBe(0);
  });

  it('text is stored as typed (never trimmed); an empty optional input means the field is absent', () => {
    const { rig, id } = show();
    type('Canonical name (required)', '  spaced  ');
    expect(draftNames(rig, id).canonical).toBe('  spaced  ');
    type(/Display name/, 'Shown');
    expect(draftNames(rig, id).display).toBe('Shown');
    type(/Display name/, '');
    expect(Object.hasOwn(draftNames(rig, id), 'display')).toBe(false);
  });

  it('list editing: add, type, move up and down, remove', () => {
    const { rig, id, dialog } = show();
    const aliases = within(within(dialog).getByRole('group', { name: 'Aliases' }));
    const start = draftNames(rig, id).aliases.length;
    fireEvent.click(aliases.getByRole('button', { name: 'Add alias' }));
    fireEvent.click(aliases.getByRole('button', { name: 'Add alias' }));
    expect(draftNames(rig, id).aliases).toHaveLength(start + 2);
    type(`Alias ${start + 1}`, 'first');
    type(`Alias ${start + 2}`, 'second');
    fireEvent.click(aliases.getByRole('button', { name: `Move alias ${start + 2} up` }));
    expect(draftNames(rig, id).aliases.slice(start)).toEqual(['second', 'first']);
    fireEvent.click(aliases.getByRole('button', { name: `Move alias ${start + 1} down` }));
    expect(draftNames(rig, id).aliases.slice(start)).toEqual(['first', 'second']);
    fireEvent.click(aliases.getByRole('button', { name: `Remove alias ${start + 1}` }));
    expect(draftNames(rig, id).aliases.slice(start)).toEqual(['second']);
  });

  it('the first item cannot move up and the last cannot move down, each with its reason', () => {
    const { rig, id, dialog } = show();
    const aliases = within(within(dialog).getByRole('group', { name: 'Aliases' }));
    fireEvent.click(aliases.getByRole('button', { name: 'Add alias' }));
    const n = draftNames(rig, id).aliases.length;
    expect(aliases.getByRole('button', { name: `Move alias ${n} down`, description: 'it is the last' }).getAttribute('aria-disabled')).toBe('true');
    expect(aliases.getByRole('button', { name: 'Move alias 1 up', description: 'it is the first' }).getAttribute('aria-disabled')).toBe('true');
  });
});

describe('the draft\'s own undo and redo', () => {
  it('buttons: Undo and Redo move the draft, and are unavailable when there is nothing to do', () => {
    const { rig, id, dialog } = show();
    const original = draftNames(rig, id).canonical;
    type('Canonical name (required)', 'Changed');
    const undo = within(dialog).getByRole('button', { name: 'Undo' });
    expect(undo.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(undo);
    expect(draftNames(rig, id).canonical).toBe(original);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Redo' }));
    expect(draftNames(rig, id).canonical).toBe('Changed');
    expect(within(dialog).getByRole('button', { name: 'Redo' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('keys: Ctrl+Z undoes, Ctrl+Shift+Z and Ctrl+Y redo, and the default action is prevented (also Cmd)', () => {
    const { rig, id } = show();
    const original = draftNames(rig, id).canonical;
    const input = screen.getByLabelText('Canonical name (required)');
    type('Canonical name (required)', 'Changed');
    const press = (init: KeyboardEventInit): boolean => fireEvent.keyDown(input, { key: 'z', ...init });
    expect(press({ ctrlKey: true })).toBe(false); // fireEvent answers false when preventDefault was called
    expect(draftNames(rig, id).canonical).toBe(original);
    expect(press({ ctrlKey: true, shiftKey: true })).toBe(false);
    expect(draftNames(rig, id).canonical).toBe('Changed');
    press({ metaKey: true });
    expect(draftNames(rig, id).canonical).toBe(original);
    expect(fireEvent.keyDown(input, { key: 'y', ctrlKey: true })).toBe(false);
    expect(draftNames(rig, id).canonical).toBe('Changed');
    expect(fireEvent.keyDown(input, { key: 'a', ctrlKey: true })).toBe(true); // other keys are left alone
  });

  it('typing a word is ONE undo step (edits to the same field within a second)', () => {
    const { rig, id } = show();
    for (const text of ['A', 'Ab', 'Abc']) type('Canonical name (required)', text);
    expect(rig.drafts.entry(id)?.session.past).toHaveLength(1);
  });
});

describe('live findings (L1, debounced 300 ms) and Save', () => {
  it('an empty canonical name gives a finding after 300 ms, marks the field, and the finding focuses it', () => {
    const { rig, dialog } = show();
    type('Canonical name (required)', '');
    expect(within(dialog).queryByRole('button', { name: /names\.canonical/ })).toBeNull(); // not yet: the debounce
    act(() => void rig.ui.fireAfter(300));
    const finding = within(dialog).getByRole('button', { name: /names\.canonical/ });
    expect(screen.getByLabelText('Canonical name (required)').getAttribute('aria-invalid')).toBe('true');
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(finding);
    expect(document.activeElement).toBe(screen.getByLabelText('Canonical name (required)'));
  });

  it('a finding on a list item focuses that item', () => {
    const { rig, dialog } = show();
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Aliases' })).getByRole('button', { name: 'Add alias' }));
    act(() => void rig.ui.fireAfter(300));
    const n = (rig.drafts.entry(rig.drafts.view().items[0]?.id ?? '')?.session.draft as { names: { aliases: string[] } }).names.aliases.length;
    fireEvent.click(within(dialog).getByRole('button', { name: new RegExp(`names\\.aliases\\[${n - 1}\\]`) }));
    expect(document.activeElement).toBe(screen.getByLabelText(`Alias ${n}`));
  });

  it('Save commits one global history entry, closes the editor and says "Saved"', async () => {
    const { rig, onClose } = show();
    const old = speciesOf(rig).names.canonical;
    type('Canonical name (required)', 'Renamed here');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(speciesOf(rig).names.canonical).toBe('Renamed here');
    expect(rig.store.historyLabels().undo).toEqual([`Edit species of ${old}`]);
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(rig.drafts.view().count).toBe(0);
  });

  it('the "Saved" toast closes by itself after 6 seconds (the save state stays in the status line)', async () => {
    const due: Array<() => void> = [];
    const ms: number[] = [];
    const timers = { set: (run: () => void, after: number) => (due.push(run), ms.push(after), due.length), clear: () => undefined };
    const rig = editorRig();
    const id = rig.open();
    const onClose = vi.fn();
    renderWithToasts(<EditorHost port={rig.port} sessionId={id} open formatTime={utcTime} onClose={onClose} />, timers);
    type('Canonical name (required)', 'Renamed here');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved')).toBeTruthy();
    expect(ms).toContain(6_000);
    act(() => due.forEach((run) => run()));
    expect(screen.queryByText('Saved')).toBeNull();
  });

  it('after a save, warnings on the record are said in the toast ("Saved, 1 warning")', async () => {
    const rig = editorRig();
    const other = Object.values(rig.store.getState().records.species).find((s) => s.id !== rig.speciesId) as { names: { canonical: string } };
    const { onClose } = show(rig);
    type('Canonical name (required)', other.names.canonical); // a name twin: a warning, not an error
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await screen.findByText(/^Saved, \d+ warnings?$/)).toBeTruthy();
  });

  it('an L3 ERROR keeps the dialog open with the store\'s findings ("Save was refused") and the store unchanged', async () => {
    const rig = editorRig();
    const id = rig.open();
    const onClose = vi.fn();
    renderWithToasts(<EditorHost port={rig.port} sessionId={id} open formatTime={utcTime} onClose={onClose} />);
    rig.drafts.edit(id, (d) => void (d.classIds = ['cls_does-not-exist']));
    const before = rig.store.getState();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    expect(screen.getAllByText(/REF-001|does-not-exist|resolve/i).length).toBeGreaterThan(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(rig.store.getState()).toBe(before);
    expect(rig.drafts.entry(id)).toBeDefined(); // the draft is kept
  });

  it('nothing to save is said, not done', async () => {
    const { rig, id } = show();
    rig.drafts.edit(id, setCanonical(speciesOf(rig).names.canonical)); // no change: no step
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Nothing to save');
  });
});

describe('closing', () => {
  it('Close keeps the draft and says "Draft kept" when something changed', async () => {
    const { rig, id, onClose } = show();
    type('Canonical name (required)', 'Kept');
    fireEvent.click(screen.getByRole('button', { name: 'Close (keeps the draft)' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(rig.drafts.entry(id)).toBeDefined();
    expect(rig.drafts.view().count).toBe(1);
    expect(await screen.findByText('Draft kept')).toBeTruthy();
  });

  it('Esc is Close: an untouched session is dropped without a word, an edited one stays', () => {
    const untouched = show();
    fireEvent(untouched.dialog, new Event('cancel', { cancelable: true }));
    expect(untouched.onClose).toHaveBeenCalledTimes(1);
    expect(untouched.rig.drafts.entry(untouched.id)).toBeUndefined();
    expect(screen.queryByText('Draft kept')).toBeNull();
  });

  it('Esc on an edited draft announces "Draft kept"', async () => {
    const { rig, id, dialog, onClose } = show();
    type('Canonical name (required)', 'x');
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).toHaveBeenCalled();
    expect(rig.drafts.entry(id)).toBeDefined();
    expect(await screen.findByText('Draft kept')).toBeTruthy();
  });

  it('Discard draft asks first; Keep it changes nothing; Discard removes the session', async () => {
    const { rig, id, onClose } = show();
    type('Canonical name (required)', 'x');
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    expect(screen.getByText('Discard this draft? It cannot be undone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(rig.drafts.entry(id)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Discard this draft?' })).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(rig.drafts.entry(id)).toBeUndefined();
    expect(rig.drafts.view().count).toBe(0);
  });

  it('the footer says where the draft is: memory mode says drafts are not kept in this window', () => {
    show();
    expect(screen.getByRole('status', { name: 'Draft status' }).textContent).toBe('Drafts are not kept in this window');
  });
});

describe('a conflict (the record changed since the draft was started)', () => {
  it('Save shows the table; "both" fields need a choice; theirsOnly and mineOnly rows say what is kept; Back returns to the draft', async () => {
    const rig = editorRig();
    const { id } = show(rig);
    type('Canonical name (required)', 'Mine');
    changeElsewhere(rig, (s) => ({ ...s, names: { ...s.names, canonical: 'Theirs' }, notes: 'their notes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'This record was changed since you started' })).toBeTruthy();
    const table = screen.getByRole('table');
    const rows = within(table).getAllByRole('row').slice(1);
    const canonical = rows.find((r) => r.textContent?.startsWith('Canonical name')) as HTMLElement;
    expect(canonical.textContent).toContain('Mine');
    expect(canonical.textContent).toContain('Theirs');
    const notes = rows.find((r) => r.textContent?.startsWith('Notes')) as HTMLElement;
    expect(notes.textContent).toContain('Kept as it is now');
    const save = screen.getByRole('button', { name: 'Save with these choices' });
    expect(save.getAttribute('aria-disabled')).toBe('true'); // no default choice
    fireEvent.click(screen.getByRole('button', { name: 'Back to the draft' }));
    expect(screen.getByLabelText('Canonical name (required)')).toBeTruthy();
    expect(rig.drafts.entry(id)).toBeDefined();
  });

  it('choosing "Take now" saves the stored value for that field and the draft\'s other changes', async () => {
    const rig = editorRig();
    const { onClose } = show(rig);
    type('Canonical name (required)', 'Mine');
    type(/IUPAC name/, 'My iupac');
    changeElsewhere(rig, (s) => ({ ...s, names: { ...s.names, canonical: 'Theirs' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'This record was changed since you started' });
    fireEvent.click(screen.getByRole('button', { name: 'Take now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save with these choices' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(speciesOf(rig).names).toMatchObject({ canonical: 'Theirs', iupac: 'My iupac' });
  });

  it('choosing "Keep mine" saves the draft\'s value', async () => {
    const rig = editorRig();
    const { onClose } = show(rig);
    type('Canonical name (required)', 'Mine');
    changeElsewhere(rig, (s) => ({ ...s, names: { ...s.names, canonical: 'Theirs' } }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'This record was changed since you started' });
    fireEvent.click(screen.getByRole('button', { name: 'Keep mine' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save with these choices' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(speciesOf(rig).names.canonical).toBe('Mine');
  });

  it('values are bounded plain text: 200 characters, then the length is said; markup is shown as text', async () => {
    const rig = editorRig();
    show(rig);
    type('Canonical name (required)', 'Mine');
    changeElsewhere(rig, (s) => ({ ...s, notes: `<b>${'x'.repeat(500)}</b>` }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const table = await screen.findByRole('table');
    expect(table.querySelector('b')).toBeNull();
    expect(table.textContent).toContain('<b>xxxx');
    expect(table.textContent).toContain('cut: 507 characters in all');
  });
});

describe('a deleted target and a read-only tab', () => {
  it('a deleted record: "This record was deleted since you started; the draft cannot be saved as an edit", with Discard draft and Back', async () => {
    const rig = editorRig();
    const source = speciesOf(rig);
    const dispatched = rig.store.dispatch({ label: 'Add', commands: [{ type: 'record.create', record: { ...source, id: 'spc_short-lived', names: { ...source.names, canonical: 'Short lived' } } as never }] });
    expect(dispatched.ok).toBe(true);
    const opened = rig.drafts.open({ kind: 'species', id: 'spc_short-lived' });
    if (!opened.ok) throw new Error(opened.message);
    renderWithToasts(<EditorHost port={rig.port} sessionId={opened.id} open formatTime={utcTime} onClose={() => undefined} />);
    fireEvent.change(screen.getByLabelText('Canonical name (required)'), { target: { value: 'Mine' } });
    expect(rig.store.dispatch({ label: 'Delete', commands: [{ type: 'record.delete', ref: { kind: 'species', id: 'spc_short-lived' }, mode: 'restrict' }] }).ok).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This record was deleted since you started; the draft cannot be saved as an edit.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Discard draft' })).toHaveLength(1); // the view's own; the footer's Save and Discard draft give way
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Canonical name (required)')).toBeTruthy();
  });

  it('a read-only tab: the fields are read-only and every control says why', () => {
    const rig = editorRig();
    const id = rig.open();
    rig.status.update({ mode: 'follower' }); // the tab stopped being the one that saves
    renderWithToasts(<EditorHost port={rig.port} sessionId={id} open formatTime={utcTime} onClose={() => undefined} />);
    const reason = 'This tab is read-only: edit in the tab that is saving';
    expect(screen.getAllByText(reason).length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Canonical name (required)') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByRole('button', { name: 'Save', description: reason }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Undo', description: reason }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(screen.getByLabelText('Canonical name (required)'), { key: 'z', ctrlKey: true });
    expect(rig.drafts.entry(id)?.canUndo).toBe(false);
  });
});
