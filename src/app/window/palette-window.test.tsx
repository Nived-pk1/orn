// @vitest-environment jsdom
/**
 * The palette in the window over the demo dataset, with the REAL search engine behind the port (step 5.8; ADV-058 UI part, the UI proof
 * of step 5.1b): Ctrl K opens it; a record is found by every alias (Unicode included) and placed; a species with a structure and no
 * entered formula is found by its derived formula, and the match says so; Enter on a family focuses it on the map, on a reaction opens
 * its family page at its card; ">" lists the commands with reasons; the choice of an exam scope by command.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createSearchEngine, buildDocument, documentPortsOf, type SearchDocument } from '@/search';
import type { CanonicalState, RecordRef, Species } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { PALETTE_DEBOUNCE_MS } from '@/features/search';

beforeAll(() => {
  stubDialog();
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
afterEach(cleanup);

/** The real engine over the app's records; `derived` stands for what the chem worker would have derived. */
function withRealSearch(app: FakeApp, state: CanonicalState, derived: Readonly<Record<string, string>> = {}): readonly SearchDocument[] {
  const derivedFormulaOf = (ref: RecordRef): string | undefined => derived[ref.id];
  const ports = documentPortsOf(state, app.navigator.ports.indexes.current(), derivedFormulaOf);
  const documents = Object.values(state.records)
    .flatMap((byId) => Object.values(byId as Record<string, never>))
    .flatMap((record) => buildDocument(record, ports) ?? []);
  const engine = createSearchEngine();
  engine.load(documents, 0);
  const services = app.value.services as unknown as { search: { search: unknown; superseded: () => number } };
  services.search = { search: (_channel: string, query: Parameters<typeof engine.search>[0]) => Promise.resolve({ ok: true as const, value: engine.search(query) }), superseded: () => 0 };
  (app.inspector as unknown as { l4: unknown }).l4 = { ...app.inspector.l4, derivedFormulaOf };
  return documents;
}

async function open(app: FakeApp) {
  renderWithApp(app);
  await screen.findByRole('group', { name: /^Navigator:/ });
  fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
  const input = await screen.findByRole('combobox');
  return input;
}
/** Types into the palette and lets the debounce (the rig's fake timers) and the answer through. */
async function type(app: FakeApp, input: HTMLElement, text: string): Promise<void> {
  fireEvent.change(input, { target: { value: text } });
  await act(async () => {
    app.navigator.timers.advance(PALETTE_DEBOUNCE_MS);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe('Ctrl K and the Search button', () => {
  it('Ctrl K opens the palette with focus in the input; Esc closes it; the Search button opens it too', async () => {
    const app = fakeApp({ state: demoState() });
    withRealSearch(app, demoState());
    const input = await open(app);
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByRole('combobox')).toBeTruthy();
  });
});

describe('a record is found by every alias and placed (ADV-058, UI part)', () => {
  const state = demoState();
  it('Unicode aliases open their record in the inspector', async () => {
    for (const [alias, id] of [['Fischer–Speier esterification', 'nrx_fischer-esterification'], ['α-H acidity', 'cpt_alpha-hydrogen-acidity']] as const) {
      cleanup();
      const app = fakeApp({ state: demoState() });
      withRealSearch(app, state);
      const input = await open(app);
      await type(app, input, alias);
      const option = await waitFor(() => {
        const found = document.querySelector(`[role="option"][data-record-id="${id}"]`);
        expect(found).not.toBeNull();
        return found as HTMLElement;
      });
      expect(option.textContent).toMatch(/Matched the (name|alias)/);
      // the selected (first) result is the record: Enter opens it
      expect(document.querySelector('[role="option"][aria-selected="true"]')?.getAttribute('data-record-id')).toBe(id);
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(app.inspectorStore.getState().history.at(-1)?.id).toBe(id);
    }
  });

  it('every alias of every record of the demo finds its record through the palette port', async () => {
    const app = fakeApp({ state: demoState() });
    const documents = withRealSearch(app, state);
    const input = await open(app);
    let checked = 0;
    for (const doc of documents) {
      for (const alias of doc.aliases) {
        const answer = await app.value.services.search.search('palette', { text: alias, limit: 100 });
        expect(answer.ok && answer.value.map((hit) => hit.ref.id), alias).toContain(doc.id);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(input).toBeTruthy();
  });

  it('a family found by name is focused on the map; a reaction found by name opens its family page at its card', async () => {
    const app = fakeApp({ state: demoState() });
    withRealSearch(app, state);
    const input = await open(app);
    await type(app, input, 'c: Alcohols');
    const hit = await waitFor(() => {
      const found = document.querySelector('[role="option"][data-record-id="cls_alcohols"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    fireEvent.click(hit); // the mouse does what Enter does
    expect(app.navigator.ports.ui.selection.getState().selected).toEqual({ kind: 'node', id: 'cls_alcohols' });
    expect(app.inspectorStore.getState().history.at(-1)).toMatchObject({ kind: 'class', id: 'cls_alcohols' });

    const reaction = Object.values(state.records.reaction)[0] as { id: string; name: string };
    const again = await screen.findByRole('button', { name: 'Search' });
    fireEvent.click(again);
    const input2 = await screen.findByRole('combobox');
    await type(app, input2, `r: ${reaction.name}`);
    const option = await screen.findByRole('option', { name: new RegExp(reaction.name.slice(0, 12)) });
    fireEvent.keyDown(input2, { key: 'Enter' });
    expect(option).toBeTruthy();
    await waitFor(() => expect(app.navigator.ports.ui.family.getState().open).not.toBeNull());
    expect(app.navigator.ports.ui.family.getState().reaction).toBe(reaction.id);
    expect(app.inspectorStore.getState().history.at(-1)?.kind).toBe('reaction');
  });
});

describe('the UI proof of derived formulas (step 5.1b)', () => {
  it('a species with a structure and no entered formula is found by its derived formula, and says so', async () => {
    const base = demoState();
    const species = base.records.species['spc_1-bromopropane' as never] as Species;
    const { formula: _dropped, ...withoutFormula } = species;
    void _dropped;
    const state = { ...base, records: { ...base.records, species: { ...base.records.species, [species.id]: withoutFormula } } } as unknown as CanonicalState;
    const app = fakeApp({ state });
    withRealSearch(app, state, { [species.id]: 'C3H7Br' });
    const input = await open(app);
    await type(app, input, 'C3H7Br');
    const options = await screen.findAllByRole('option');
    const mine = options.find((option) => option.getAttribute('data-record-id') === species.id);
    expect(mine).toBeDefined();
    expect(within(mine as HTMLElement).getByText('Matched the derived formula “C3H7Br”')).toBeTruthy();
    const entered = options.find((option) => option.getAttribute('data-record-id') === 'spc_2-bromopropane');
    expect(within(entered as HTMLElement).getByText('Matched the formula “C3H7Br”')).toBeTruthy();
  });
});

describe('commands', () => {
  it('">" lists only commands that exist, unavailable ones with their reason', async () => {
    const app = fakeApp({ state: demoState() });
    withRealSearch(app, demoState());
    const input = await open(app);
    await type(app, input, '>');
    const titles = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    for (const wanted of ['Replace with the demo dataset', 'Undo import', 'Fit', 'Zoom in', 'Zoom out', 'Show the List view', 'Overview', 'Open the Unanchored reactions', 'Choose the exam scope: All (no exam scope)']) {
      expect(titles.some((t) => t.startsWith(wanted)), wanted).toBe(true);
    }
    // the overview is already shown: said, not hidden
    const overview = screen.getAllByRole('option').find((option) => (option.textContent ?? '').startsWith('Overview'));
    expect(overview?.textContent).toContain('Not available: the overview is already shown');
  });

  it('"> list" runs Show the List view', async () => {
    const app = fakeApp({ state: demoState() });
    withRealSearch(app, demoState());
    const input = await open(app);
    await type(app, input, '> list');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(app.navigator.ports.ui.overview.getState().mode).toBe('list');
  });

  it('choosing an exam scope by command sets the active exam version', async () => {
    const app = fakeApp({ state: demoState() });
    withRealSearch(app, demoState());
    const input = await open(app);
    await type(app, input, '> exam main');
    const option = screen.getAllByRole('option')[0] as HTMLElement;
    expect(option.textContent).toContain('JEE Main, provisional, not verified');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(app.navigator.ports.ui.exam.getState().active).toEqual({ examId: 'exm_jee-main', examVersionId: 'exv_jee-main-2026' });
  });
});
