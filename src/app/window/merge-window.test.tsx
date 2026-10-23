// @vitest-environment jsdom
/**
 * Merge through the real window (step 6.8a, D3): (1) a duplicate made through the editor is merged INTO the original from the duplicate
 * dialog - nothing is added, the original gains the typed alias, one Undo; (2) "Merge into..." in the editor toolbar merges a STORED copy:
 * every reference to it points at the original, the copy is gone, ONE Undo ("Undo merge A into B") restores everything.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ChemicalClass, RecordRef, Species } from '@/core/schema';
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
const speciesOf = (app: FakeApp, id: string): Species => app.store.getState().records.species[id as never] as Species;
/** A demo species that some class lists as an example (so a copy of it can be listed too). */
function original(app: FakeApp): { species: Species; klass: ChemicalClass } {
  const state = app.store.getState();
  for (const klass of Object.values(state.records.class) as ChemicalClass[]) {
    const id = klass.exampleSpeciesIds[0];
    if (id !== undefined) return { species: speciesOf(app, id), klass };
  }
  throw new Error('no class lists an example species in the demo');
}
function inspect(app: FakeApp, ref: RecordRef): void {
  app.panels.getState().setInspectorOpen(true);
  renderWithApp(app);
  act(() => app.inspectorStore.getState().open(ref));
}

describe('Merge from the duplicate dialog', () => {
  it('a draft with the name of an existing species: Save lists it, Merge into it adds no species, and one Undo reverts', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const { species } = original(app);
    (app.value.services as unknown as Record<string, unknown>).duplicateCheck = {
      check: async () => ({ matches: [{ ref: { kind: 'species', id: species.id }, name: species.names.canonical, reasons: ['name'] }], more: 0, structureChecked: true }),
    };
    // a NEW species draft through the Workbench
    renderWithApp(app);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'New species' }));
    const editor = await screen.findByRole('dialog', { name: /^New species/ });
    fireEvent.change(within(editor).getByLabelText('Canonical name (required)'), { target: { value: species.names.canonical } });
    const before = Object.keys(app.store.getState().records.species).length;
    fireEvent.click(within(editor).getByRole('button', { name: 'Save' }));
    const dup = await screen.findByRole('dialog', { name: 'This may already exist' });
    fireEvent.click(within(dup).getByRole('button', { name: 'Merge' }));
    const dialog = await screen.findByRole('dialog', { name: `Merge into ${species.names.canonical}` });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(app.store.historyLabels().undo[0]).toMatch(/^merge /));
    expect(Object.keys(app.store.getState().records.species)).toHaveLength(before);
    act(() => void app.store.undo());
    expect(speciesOf(app, species.id)).toEqual(species);
  });
});

describe('Merge into... (editor toolbar) of a stored copy', () => {
  it('every reference to the copy points at the original, the copy is gone, one Undo restores everything', async () => {
    const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
    const { species, klass } = original(app);
    const copy = { ...species, id: 'spc_copy-of-original', names: { ...species.names, canonical: `${species.names.canonical} (copy)`, common: [], aliases: ['The copy alias'] } } as unknown as Species;
    const created = app.store.dispatch({
      label: 'make a copy',
      commands: [
        { type: 'record.create', record: copy },
        { type: 'record.update', record: { ...klass, exampleSpeciesIds: [...klass.exampleSpeciesIds, copy.id] } as never },
      ],
    });
    expect(created.ok).toBe(true);
    const before = app.store.getState().records;
    inspect(app, { kind: 'species', id: copy.id });
    fireEvent.click(within(pane()).getByRole('button', { name: 'Edit' }));
    const editor = await screen.findByRole('dialog', { name: /^Edit / });
    fireEvent.click(within(editor).getByRole('button', { name: 'Merge into...' }));
    const picker = await screen.findByRole('dialog', { name: 'Merge into...' });
    fireEvent.change(within(picker).getByLabelText('Search for the species to keep'), { target: { value: species.names.canonical.slice(0, 5) } });
    fireEvent.click(await within(picker).findByRole('button', { name: `Merge into ${species.names.canonical}` }));
    const dialog = await screen.findByRole('dialog', { name: `Merge into ${species.names.canonical}` });
    expect(await within(dialog).findByRole('list', { name: 'Records that will change' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(Object.hasOwn(app.store.getState().records.species, copy.id)).toBe(false));
    const after = app.store.getState();
    expect((after.records.class[klass.id as never] as ChemicalClass).exampleSpeciesIds).toEqual(klass.exampleSpeciesIds);
    expect(speciesOf(app, species.id).names.aliases).toEqual(expect.arrayContaining([`${species.names.canonical} (copy)`, 'The copy alias']));
    expect(app.store.historyLabels().undo[0]).toBe(`merge ${copy.names.canonical} into ${species.names.canonical}`);
    act(() => void app.store.undo());
    expect(app.store.getState().records).toEqual(before);
  });
});
