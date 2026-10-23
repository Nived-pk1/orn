// @vitest-environment jsdom
/**
 * Delete through the real window (step 6.8a, D1): the inspector's "Delete..." and the editor toolbar's "Delete..." show the impact dialog,
 * Delete is ONE history step ("Undo delete <name>") and one Undo brings everything back, a record that is used cannot be deleted (Delete is
 * unavailable), and an open draft of a record that is deleted (here or elsewhere) shows "This record was deleted" with "Save as a new
 * record" and "Discard draft".
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteEnvelope, deleteView } from '@/core/editing';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { NavigatorAnchor, RecordKind, RecordRef, Species } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';

beforeAll(async () => {
  await import('@/features/workbench/layer');
  await import('./editor-session');
  await import('./delete-host');
  stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  const proto = Element.prototype as unknown as { scrollIntoView?: () => void; hasPointerCapture?: () => boolean; releasePointerCapture?: () => void };
  proto.scrollIntoView ??= () => undefined;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pane = (): HTMLElement => screen.getByRole('complementary', { name: 'Inspector' });

/** The first species of the demo (by id) for which `want(view)` holds - found from the registry's own policies, never by name. */
function pickSpecies(app: FakeApp, want: (view: ReturnType<typeof deleteView>) => boolean): RecordRef {
  const state = app.store.getState();
  const indexes = coreIndexEngine.build(state);
  for (const id of Object.keys(state.records.species).sort()) {
    const ref = { kind: 'species', id } as RecordRef;
    if (want(deleteView(state, indexes, [ref]))) return ref;
  }
  throw new Error('no such species in the demo');
}
function inspect(app: FakeApp, ref: RecordRef): void {
  app.panels.getState().setInspectorOpen(true);
  renderWithApp(app);
  act(() => app.inspectorStore.getState().open(ref));
}
const nameOf = (app: FakeApp, ref: RecordRef): string => (app.store.getState().records[ref.kind as RecordKind][ref.id as never] as Species).names.canonical;
const has = (app: FakeApp, ref: RecordRef): boolean => Object.hasOwn(app.store.getState().records[ref.kind], ref.id);

describe('Delete from the inspector', () => {
  it('shows the impact, Delete is one history step, and one Undo brings everything back', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const ref = pickSpecies(app, (view) => view.canDelete && view.removedFrom.length > 0);
    const name = nameOf(app, ref);
    const before = app.store.getState().records;
    inspect(app, ref);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Delete...' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete ${name}?` });
    expect(within(dialog).getByRole('list', { name: 'Removed from' })).toBeTruthy();
    expect(has(app, ref)).toBe(true); // nothing has changed yet
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(has(app, ref)).toBe(false));
    expect(app.store.historyLabels().undo[0]).toBe(`delete ${name}`);
    fireEvent.click(await screen.findByRole('button', { name: `Undo delete ${name}` }));
    await waitFor(() => expect(has(app, ref)).toBe(true));
    expect(app.store.getState().records).toEqual(before);
  });

  it('a species a reaction uses is BLOCKED: the blocker is listed with Open and Delete is unavailable', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const ref = pickSpecies(app, (view) => !view.canDelete);
    inspect(app, ref);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Delete...' }));
    const dialog = await screen.findByRole('dialog', { name: `Delete ${nameOf(app, ref)}?` });
    expect(within(dialog).getByRole('list', { name: 'Blocks the delete' })).toBeTruthy();
    const button = within(dialog).getByRole('button', { name: 'Delete' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(has(app, ref)).toBe(true);
    expect(app.store.historyLabels().undo).toEqual([]);
  });
});

describe('an open draft of a record that is deleted', () => {
  it('shows "This record was deleted" at once; Save as a new record keeps the typed fields under a new ID', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const ref = pickSpecies(app, (view) => view.canDelete);
    inspect(app, ref);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: /^Edit / });
    fireEvent.change(within(editor).getByLabelText('Canonical name (required)'), { target: { value: 'Typed after the delete' } });
    act(() => void app.store.dispatch(deleteEnvelope(app.store.getState(), [ref])));
    const notice = await within(editor).findByRole('region', { name: 'Deleted record' });
    expect(notice.textContent).toContain('This record was deleted');
    expect(within(notice).getByRole('button', { name: 'Discard draft' })).toBeTruthy();
    const before = Object.keys(app.store.getState().records.species);
    fireEvent.click(within(notice).getByRole('button', { name: 'Save as a new record' }));
    const next = await screen.findByRole('dialog', { name: /^New species/ });
    expect((within(next).getByLabelText('Canonical name (required)') as HTMLInputElement).value).toBe('Typed after the delete');
    fireEvent.click(within(next).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(Object.keys(app.store.getState().records.species).length).toBe(before.length + 1));
    const added = Object.keys(app.store.getState().records.species).filter((id) => !before.includes(id));
    expect(added).toHaveLength(1);
    expect(added[0]).not.toBe(ref.id);
    expect((app.store.getState().records.species[added[0] as never] as Species).names.canonical).toBe('Typed after the delete');
  });

  it('the editor toolbar has Delete... and shows the same dialog', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const ref = pickSpecies(app, (view) => view.canDelete);
    inspect(app, ref);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: /^Edit / });
    fireEvent.click(within(editor).getByRole('button', { name: 'Delete...' }));
    expect(await screen.findByRole('dialog', { name: `Delete ${nameOf(app, ref)}?` })).toBeTruthy();
  });
});

describe('Remove from the map (D2)', () => {
  it('the Map family section of the class editor deletes the family through the same dialog; one Undo brings it back', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const anchor = (Object.values(app.store.getState().records.navigator_anchor) as NavigatorAnchor[]).find((one) => one.target.kind === 'class');
    if (anchor === undefined) throw new Error('the demo has no class family');
    inspect(app, anchor.target as RecordRef);
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: /^Edit / });
    fireEvent.click(await within(editor).findByRole('button', { name: 'Remove from the map' }));
    const dialog = await screen.findByRole('dialog', { name: /^Delete / });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const ref = { kind: 'navigator_anchor', id: anchor.id } as RecordRef;
    await waitFor(() => expect(has(app, ref)).toBe(false));
    expect(app.store.historyLabels().undo[0]).toMatch(/^delete /);
    act(() => void app.store.undo());
    expect(has(app, ref)).toBe(true);
  });
});
