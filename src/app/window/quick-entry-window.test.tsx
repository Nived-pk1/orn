// @vitest-environment jsdom
/**
 * Quick entry through the real window (step 6.7b, Q1-Q4): the Workbench page, the palette and phone More open the dialog; every term of
 * "ethanol + PCC (CH2Cl2) -> ethanal" resolves on the demo, the condition text is kept as text (the condition parser has no solvent
 * vocabulary), "Open in the reaction editor" gives a NEW draft whose product role says "Choose a role", and Save after choosing adds the
 * reaction; an unknown name is created through the nested editor and resolves the term; a SMILES term is read by the chem worker and
 * matched through the duplicate check.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Reaction, Species } from '@/core/schema';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';
import { buildCommands, type CommandDeps } from './palette-commands';
import { editorCommandDeps } from './editor-commands';

beforeAll(async () => {
  await prefetchPalette();
  await import('@/features/workbench/layer');
  await import('./editor-session');
  await import('./quick-entry-host');
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

const reactions = (app: FakeApp): Reaction[] => Object.values(app.store.getState().records.reaction) as Reaction[];
const speciesOf = (app: FakeApp): Species[] => Object.values(app.store.getState().records.species) as Species[];

/** The fake window's search is not ready; the pickers need names found, so it looks them up in the store (by substring of the name). */
function searchByName(app: FakeApp): void {
  const services = app.value.services as unknown as { search: { search: unknown } };
  services.search.search = async (_channel: string, request: { text: string; kinds: readonly string[] }) => ({
    ok: true,
    value: request.kinds.flatMap((kind) =>
      Object.values((app.store.getState().records as unknown as Record<string, Record<string, { id: string; names?: { canonical: string; common?: string[]; aliases?: string[] }; name?: string }>>)[kind] ?? {})
        .filter((r) => [r.names?.canonical ?? r.name ?? '', ...(r.names?.common ?? []), ...(r.names?.aliases ?? [])].some((n) => n.toLowerCase().includes(request.text.toLowerCase())))
        .map((r) => ({ ref: { kind, id: r.id } })),
    ),
  });
}
/** A chem worker that reads exactly the SMILES it is given, and a duplicate check that finds the species with the same structure. */
function withChem(app: FakeApp, readable: Record<string, string | null>): void {
  const services = app.value.services as unknown as Record<string, unknown>;
  services.chem = {
    parse: async (structure: { value: string }) =>
      structure.value in readable ? { ok: true, facts: {} } : { ok: false, reason: 'invalid', problem: 'unreadable', error: 'not a structure' },
  };
  services.duplicateCheck = {
    check: async (_kind: string, draft: { structure?: { value: string } }) => {
      const id = readable[draft.structure?.value ?? ''];
      return { matches: id === null || id === undefined ? [] : [{ ref: { kind: 'species', id }, name: id, reasons: ['structure'] }], more: 0, structureChecked: true };
    },
  };
}
const openWorkbench = (): void => {
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
};
async function openQuickEntry(app: FakeApp): Promise<HTMLElement> {
  searchByName(app);
  renderWithApp(app);
  openWorkbench();
  fireEvent.click(await screen.findByRole('button', { name: 'Quick entry' }));
  return screen.findByRole('dialog', { name: 'Quick entry' });
}
const type = (dialog: HTMLElement, text: string): void => void fireEvent.change(within(dialog).getByLabelText('Reaction line'), { target: { value: text } });
const row = async (dialog: HTMLElement, text: string): Promise<HTMLElement> => {
  await waitFor(() => expect(within(dialog).getAllByTestId('quick-term').some((r) => r.getAttribute('data-term') === text)).toBe(true));
  return within(dialog).getAllByTestId('quick-term').find((r) => r.getAttribute('data-term') === text) as HTMLElement;
};

/** In the demo "PCC" is both the name of a reagent and an alias of the species that reagent is made of: it resolves to the REAGENT at once (U3) and offers "Use the species instead". */
async function chooseReagentPcc(dialog: HTMLElement): Promise<void> {
  const pcc = await row(dialog, 'PCC');
  await waitFor(() => expect(pcc.textContent).toContain('PCC (reagent)'));
  expect(pcc.textContent).toContain('Use the species instead');
  expect(pcc.textContent).not.toContain('Which one?');
}

describe('entry points', () => {
  it('the Workbench page has a Quick entry button that opens the dialog; a read-only tab says why', async () => {
    const dialog = await openQuickEntry(fakeApp({ state: demoState() }));
    expect(within(dialog).getByLabelText('Reaction line')).toBeTruthy();
    expect(within(dialog).getByRole('list', { name: 'Examples' })).toBeTruthy();
    cleanup();
    renderWithApp(fakeApp({ state: demoState(), status: { mode: 'follower', reason: 'other_tab_is_writer' } }));
    openWorkbench();
    expect((await screen.findByRole('button', { name: 'Quick entry' })).getAttribute('aria-disabled')).toBe('true');
  });
  it('the palette lists Quick entry in Studio', () => {
    const run = vi.fn();
    const deps = editorCommandDeps({ editReason: undefined, entries: [], quickEntry: { title: 'Quick entry', paletteId: 'quick-entry', keywords: ['reaction', 'line'] }, openQuickEntry: run } as never, demoState(), { history: [], index: -1 } as never);
    const quick = (deps.newKinds ?? []).find((c) => c.id === 'quick-entry');
    expect(quick?.title).toBe('Quick entry');
    quick?.run();
    expect(run).toHaveBeenCalledTimes(1);
    const base = { mode: 'navigator', setMode: () => undefined, hasData: true, writerMode: 'writer', writerReason: null, importReason: undefined, askReplace: () => undefined, undoImport: () => undefined, pickFile: () => undefined, openExport: () => undefined, ui: fakeApp({ state: demoState() }).navigator.ports.ui, exams: { options: [], omitted: 0 } };
    expect(buildCommands({ ...base, newKinds: deps.newKinds } as unknown as CommandDeps).some((c) => c.id === 'quick-entry')).toBe(true);
  });
  describe('on a phone', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    });
    it('More > Quick entry opens the dialog', async () => {
      const app = fakeApp({ state: demoState(), navigator: { depictions: true } });
      searchByName(app);
      renderWithApp(app);
      fireEvent.click(screen.getByRole('button', { name: 'More' }));
      fireEvent.click(await within(screen.getByRole('dialog', { name: 'More' })).findByRole('button', { name: 'Quick entry' }));
      expect(await screen.findByRole('dialog', { name: 'Quick entry' })).toBeTruthy();
    });
  });
});

describe('the PCC line end to end', () => {
  it('every term resolves, the condition text is kept as text, Open gives a draft with "Choose a role", Save after choosing adds the reaction', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openQuickEntry(app);
    type(dialog, 'ethanol + PCC (CH2Cl2) -> ethanal');
    expect((await row(dialog, 'ethanol')).textContent).toContain('Ethanol');
    await waitFor(() => expect((within(dialog).getAllByTestId('quick-term').find((r) => r.getAttribute('data-term') === 'ethanol') as HTMLElement).textContent).toContain('species'));
    await chooseReagentPcc(dialog);
    await waitFor(() => expect((within(dialog).getAllByTestId('quick-term').find((r) => r.getAttribute('data-term') === 'ethanal') as HTMLElement).textContent).toContain('Ethanal'));
    await waitFor(() => expect(within(dialog).getByTestId('quick-scope').textContent).toMatch(/Specific: every term is a species or a reagent/));
    expect(within(dialog).getByRole('group', { name: 'Conditions of stage 1' }).textContent).toMatch(/Not recognised.*CH2Cl2/); // this fake search finds names only, not formulas
    await waitFor(() => expect(within(dialog).getByRole('list', { name: 'Reaction preview' })).toBeTruthy()); // the card's equation, drawn from the draft
    const before = reactions(app).length;
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in the reaction editor' }));
    const editor = await screen.findByRole('dialog', { name: 'New reaction' });
    expect((within(editor).getByLabelText('Name (required)') as HTMLInputElement).value).toBe('ethanol + PCC (CH2Cl2) → ethanal');
    expect((within(editor).getByLabelText('Scope (required)') as HTMLSelectElement).value).toBe('specific');
    expect(reactions(app)).toHaveLength(before); // nothing is saved yet
    expect(within(editor).getAllByTestId('participant-row')).toHaveLength(2);
    // Save is refused while the product role is not chosen
    await act(async () => void fireEvent.click(within(editor).getByRole('button', { name: 'Save' })));
    expect(await within(editor).findByRole('heading', { name: 'Save was refused' })).toBeTruthy();
    fireEvent.click(within(editor).getByRole('button', { name: 'Edit outcome 1' }));
    expect(within(editor).getByText('Choose a role')).toBeTruthy();
    fireEvent.click(within(within(editor).getByRole('group', { name: 'Role of product 1 of outcome 1' })).getByLabelText('Main'));
    await act(async () => void fireEvent.click(within(editor).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(reactions(app)).toHaveLength(before + 1));
    const made = reactions(app).find((r) => r.name === 'ethanol + PCC (CH2Cl2) → ethanal') as Reaction;
    expect(made.participants.map((p) => [p.ref.id, p.role])).toEqual([['spc_ethanol', 'reactant'], ['rgt_pcc', 'reagent']]);
    expect(made.stages[0]?.parameters.text).toBe('CH2Cl2');
    expect(made.outcomes[0]).toMatchObject({ selectivity: 'unspecified', conditionVariantIds: [] });
    expect(made.outcomes[0]?.products.map((p) => [p.ref.id, p.role])).toEqual([['spc_ethanal', 'main']]);
  });

  it('a parsed condition needs Confirm in the editor', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openQuickEntry(app);
    type(dialog, 'ethanol + PCC (0 °C) -> ethanal');
    await chooseReagentPcc(dialog);
    await waitFor(() => expect(within(dialog).getByRole('group', { name: 'Conditions of stage 1' }).textContent).toMatch(/0 °C → temperature \(needs Confirm/));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Open in the reaction editor' }).getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in the reaction editor' }));
    const editor = await screen.findByRole('dialog', { name: 'New reaction' });
    fireEvent.click(await within(editor).findByRole('button', { name: 'Edit conditions of stage 1' }));
    expect(within(editor).getAllByText(/Read from the text/).length).toBeGreaterThan(0);
    expect(within(editor).getByRole('button', { name: /^Confirm temperature/ })).toBeTruthy();
  });

  it('U2: an item in ( ) that names a demo species becomes a participant whose role is still to be chosen in the editor', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openQuickEntry(app);
    type(dialog, 'ethanol + PCC (dichloromethane) -> ethanal');
    await chooseReagentPcc(dialog);
    const solvent = await within(dialog).findByTestId('quick-condition-species');
    expect(solvent.textContent).toMatch(/Dichloromethane.*Choose a role in the editor/);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Open in the reaction editor' }).getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in the reaction editor' }));
    const editor = await screen.findByRole('dialog', { name: 'New reaction' });
    expect(within(editor).getAllByTestId('participant-row')).toHaveLength(3);
    fireEvent.click(within(editor).getByRole('button', { name: 'Edit participant 3' }));
    const role = within(editor).getByLabelText('Role of participant 3') as HTMLSelectElement;
    expect(role.value).toBe('');
    expect(within(role).getByRole('option', { name: 'Choose a role' })).toBeTruthy();
  });

  it('a two-stage line: ", then" gives a second stage with its own participants', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openQuickEntry(app);
    type(dialog, 'ethanol + PCC, then Sulfuric acid -> ethanal');
    await chooseReagentPcc(dialog);
    const acid = await row(dialog, 'Sulfuric acid'); // a species and a reagent have this name
    await waitFor(() => expect(acid.textContent).toContain('(reagent)'));
    expect(acid.textContent).not.toContain('Which one?');
    await waitFor(() => expect(within(dialog).getByRole('region', { name: 'Stage 2' })).toBeTruthy());
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Open in the reaction editor' }).getAttribute('aria-disabled')).toBeNull());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open in the reaction editor' }));
    const editor = await screen.findByRole('dialog', { name: 'New reaction' });
    const stages = within(within(editor).getByRole('list', { name: 'Stages' })).getAllByRole('group', { name: /^Stage \d+$/ });
    expect(stages).toHaveLength(2);
    expect(within(editor).getAllByTestId('participant-row')).toHaveLength(3);
  });
});

describe('Create new and structures', () => {
  it('an unknown name is created through the nested editor and resolves the term', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openQuickEntry(app);
    type(dialog, 'ethanol + zzzene -> ethanal');
    const unknown = await row(dialog, 'zzzene');
    await waitFor(() => expect(unknown.textContent).toContain('Not found'));
    const before = speciesOf(app).length;
    fireEvent.click(within(unknown).getByRole('button', { name: 'Create new species "zzzene"' }));
    const nested = await screen.findByRole('dialog', { name: 'New species' });
    expect((within(nested).getByLabelText('Canonical name (required)') as HTMLInputElement).value).toBe('zzzene');
    await act(async () => void fireEvent.click(within(nested).getByRole('button', { name: 'Save' })));
    await waitFor(() => expect(speciesOf(app)).toHaveLength(before + 1));
    await waitFor(() => expect(unknown.textContent).toContain('zzzene · species'));
    expect(unknown.textContent).not.toContain('Not found');
  });

  it('a SMILES term the chem worker reads is matched by structure, else offered as a new species with that structure', async () => {
    const app = fakeApp({ state: demoState() });
    withChem(app, { CCO: 'spc_ethanol', C1CCCCC1: null });
    const dialog = await openQuickEntry(app);
    type(dialog, 'CCO + C1CCCCC1 -> ethanal');
    const matched = await row(dialog, 'CCO');
    await waitFor(() => expect(matched.textContent).toMatch(/Ethanol · species \(matched by structure\)/));
    const fresh = await row(dialog, 'C1CCCCC1');
    fireEvent.click(await within(fresh).findByRole('button', { name: 'Create new species with this structure' }));
    const nested = await screen.findByRole('dialog', { name: 'New species' });
    expect((within(nested).getByLabelText('Canonical name (required)') as HTMLInputElement).value).toBe('');
    expect(JSON.stringify(app.drafts.view().items)).toBeTruthy();
  });

  it('a line with an error shows its words in the dialog', async () => {
    const dialog = await openQuickEntry(fakeApp({ state: demoState() }));
    type(dialog, 'ethanol + PCC');
    expect((await within(dialog).findByRole('list', { name: 'Problems with the line' })).textContent).toMatch(/No arrow/);
  });

  it('Close keeps the typed line for the session', async () => {
    const app = fakeApp({ state: demoState() });
    const dialog = await openQuickEntry(app);
    type(dialog, 'ethanol -> ethanal');
    fireEvent.click(within(dialog).getByRole('button', { name: /^Close/ }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Quick entry' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Quick entry' }));
    const again = await screen.findByRole('dialog', { name: 'Quick entry' });
    expect((within(again).getByLabelText('Reaction line') as HTMLInputElement).value).toBe('ethanol -> ethanal');
  });
});
