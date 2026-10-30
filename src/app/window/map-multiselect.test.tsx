// @vitest-environment jsdom
/**
 * Multi-selection on the map (step 6.8b, R2), in Studio: Shift-click toggles a family box or an arrow, Shift-drag draws a marquee that
 * selects the boxes wholly inside it, Escape clears, Shift+Space toggles the focused family, the line says "3 families and 2 arrows
 * selected (14 reactions)", and the bulk actions "Mark verified (n)" (the review queue's path, with its confirm) and "Delete (n)" (ONE
 * aggregated impact dialog, ONE undo step) act on the selection's reactions. A phone has a Select toggle and a bottom bar. The Study
 * window has none of it: Shift-click is a plain click there.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(edition: 'study' | 'studio') {
  vi.resetModules();
  vi.stubGlobal('__ORN_EDITION__', edition);
  const rtl = await import('@testing-library/react');
  const kit = await import('@/test-support/window-kit');
  const pointer = await import('@/test-support/pointer-kit');
  const { demoState } = await import('@/test-support/app-boot-kit');
  const { fakeLayout } = await import('@/test-support/inspector-kit');
  const { PHONE_QUERIES } = await import('@/ui/hooks');
  // the multi-selection engine is a lazy chunk (step 6.8b, Y1); a test that is not about the loading has it there from the first Shift-click
  const { loadMultiEngine } = await import('@/features/navigator');
  await loadMultiEngine();
  kit.stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  return { ...rtl, ...kit, ...pointer, demoState, PHONE_QUERIES };
}
const loaded = { study: await load('study'), studio: await load('studio') }; // studio last: the global setup warms the editors under the stub that stays
afterEach(() => {
  loaded.studio.cleanup();
  loaded.study.cleanup();
  vi.unstubAllGlobals();
});
type Loaded = typeof loaded.studio;

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const hub = (k: Loaded, name: string): HTMLElement => k.screen.getByRole('graphics-symbol', { name: new RegExp(`^${name}, class hub`) });
const arrow = (k: Loaded, name: RegExp): HTMLElement => k.screen.getByRole('graphics-symbol', { name });
const drawing = (k: Loaded): Promise<HTMLElement> => k.screen.findByRole('group', { name: NAVIGATOR });
const line = (k: Loaded): string => (k.screen.getByRole('toolbar', { name: 'Canvas tools' }).querySelector('p')?.textContent ?? '');
const asPhone = (k: Loaded) => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === k.PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));

/** The demo with every reaction "not reviewed", so a bulk Mark verified has something to do. */
async function open(k: Loaded) {
  const app = k.fakeApp({ state: k.demoState(), navigator: { depictions: true } });
  const reactions = Object.values(app.store.getState().records.reaction) as unknown as { review: Record<string, unknown> }[];
  k.act(() => {
    app.store.dispatch({ label: 'prepare', commands: reactions.map((record) => ({ type: 'record.update', record: { ...record, review: { ...record.review, status: 'unreviewed', reasons: [] } } }) as never) });
  });
  k.renderWithApp(app);
  await drawing(k);
  return app;
}
/** The same on a phone: the map is the Map tab. */
async function openPhone(k: Loaded) {
  const app = k.fakeApp({ state: k.demoState(), navigator: { depictions: true } });
  const reactions = Object.values(app.store.getState().records.reaction) as unknown as { review: Record<string, unknown> }[];
  k.act(() => {
    app.store.dispatch({ label: 'prepare', commands: reactions.map((record) => ({ type: 'record.update', record: { ...record, review: { ...record.review, status: 'unreviewed', reasons: [] } } }) as never) });
  });
  k.renderWithApp(app);
  k.fireEvent.click(k.within(k.screen.getByRole('navigation', { name: 'Home' })).getByRole('button', { name: 'Map' }));
  await drawing(k);
  return app;
}
const reviews = (app: Awaited<ReturnType<typeof open>>): string[] => Object.values(app.store.getState().records.reaction).map((one) => (one as unknown as { review: { status: string } }).review.status);

describe('Studio: choosing items', () => {
  it('Shift-click toggles families and arrows; the line says how many and how many reactions', async () => {
    const k = loaded.studio;
    await open(k);
    k.tap(hub(k, 'Aldehydes'), { shift: true });
    expect(line(k)).toMatch(/^1 family selected \(\d+ reactions?\)$/);
    k.tap(hub(k, 'Alcohols'), { shift: true });
    k.tap(arrow(k, /^Alcohols to Aldehydes, 2 reactions \(\+ 1 example\)/), { shift: true });
    expect(line(k)).toMatch(/^2 families and 1 arrow selected \(\d+ reactions?\)$/);
    k.tap(hub(k, 'Aldehydes'), { shift: true });
    expect(line(k)).toMatch(/^1 family and 1 arrow selected/);
  });

  it('a plain click keeps the single selection (and drops the multi-selection)', async () => {
    const k = loaded.studio;
    await open(k);
    k.tap(hub(k, 'Aldehydes'), { shift: true });
    k.tap(hub(k, 'Alcohols'), { shift: true });
    k.tap(hub(k, 'Aldehydes'));
    expect(line(k)).toMatch(/^Selected: Aldehydes, class hub/);
    expect(k.screen.queryByRole('button', { name: /^Mark verified \(/ })).toBeNull();
  });

  it('Escape clears the multi-selection; Shift+Space toggles the focused family', async () => {
    const k = loaded.studio;
    await open(k);
    const svg = await drawing(k);
    k.act(() => svg.focus());
    k.fireEvent.keyDown(svg, { key: 'Tab' });
    k.fireEvent.keyDown(svg, { key: ' ', shiftKey: true });
    expect(line(k)).toMatch(/^1 family selected/);
    k.fireEvent.keyDown(svg, { key: ' ', shiftKey: true });
    expect(line(k)).toBe('Nothing is selected.');
    k.fireEvent.keyDown(svg, { key: ' ', shiftKey: true });
    k.fireEvent.keyDown(svg, { key: 'Escape' });
    expect(line(k)).toBe('Nothing is selected.');
  });

  it('a marquee over the whole drawing selects every family box, not the arrows', async () => {
    const k = loaded.studio;
    await open(k);
    const svg = await drawing(k);
    k.firePointer(svg, 'pointerdown', { x: -100000, y: -100000, shift: true });
    k.firePointer(document, 'pointermove', { x: 100000, y: 100000, shift: true });
    k.firePointer(document, 'pointerup', { x: 100000, y: 100000, shift: true });
    expect(line(k)).toMatch(/^\d+ families selected \(\d+ reactions\)$/);
    expect(line(k)).not.toMatch(/arrow/);
  });
});

describe('Studio: bulk actions on the reactions of the selection', () => {
  it('Mark verified (n) goes the review queue\'s way: ONE step with the injected clock; Undo brings the reactions back', async () => {
    const k = loaded.studio;
    const app = await open(k);
    k.tap(hub(k, 'Alcohols'), { shift: true });
    k.tap(hub(k, 'Aldehydes'), { shift: true });
    const go = k.screen.getByRole('button', { name: /^Mark verified \(\d+\)$/ });
    const n = Number(/\((\d+)\)/.exec(go.textContent ?? '')?.[1]);
    expect(n).toBeGreaterThan(0);
    k.fireEvent.click(go);
    await k.waitFor(() => expect(reviews(app).filter((one) => one === 'verified')).toHaveLength(n)); // the dialogs are a lazy chunk
    k.fireEvent.click(k.within(document.querySelector('header') as HTMLElement).getByRole('button', { name: `Undo mark verified (${n})` }));
    expect(reviews(app).filter((one) => one === 'verified')).toHaveLength(0);
  });

  it('Delete (n) lists what blocks it (a route that uses a reaction) and stays unavailable', async () => {
    const k = loaded.studio;
    const app = await open(k);
    k.tap(arrow(k, /^Alcohols to Aldehydes, 2 reactions \(\+ 1 example\)/), { shift: true });
    const n = Number(/\((\d+)\)/.exec(k.screen.getByRole('button', { name: /^Delete \(\d+\)$/ }).textContent ?? '')?.[1]);
    k.fireEvent.click(k.screen.getByRole('button', { name: /^Delete \(\d+\)$/ }));
    const dialog = await k.screen.findByRole('dialog', { name: `Delete ${n} records?` }, { timeout: 10_000 });
    expect(k.within(dialog).getByRole('list', { name: 'Records to delete' }).querySelectorAll('li')).toHaveLength(n);
    expect(k.within(dialog).getByRole('list', { name: 'Blocks the delete' }).textContent).toMatch(/route/);
    expect(k.within(dialog).getByRole('button', { name: 'Delete' }).getAttribute('aria-disabled')).toBe('true');
    expect(Object.keys(app.store.getState().records.reaction).length).toBeGreaterThanOrEqual(n);
  });

  it('Delete (n), once nothing blocks, deletes in ONE step: "Undo delete n records" brings every record back', async () => {
    const k = loaded.studio;
    const app = await open(k);
    const routes = Object.keys(app.store.getState().records.route);
    k.act(() => {
      app.store.dispatch({ label: 'drop routes', commands: routes.map((id) => ({ type: 'record.delete', ref: { kind: 'route', id }, mode: 'apply_cascade' }) as never) });
    });
    k.tap(arrow(k, /^Alcohols to Aldehydes, 2 reactions \(\+ 1 example\)/), { shift: true });
    const go = k.screen.getByRole('button', { name: /^Delete \(\d+\)$/ });
    const n = Number(/\((\d+)\)/.exec(go.textContent ?? '')?.[1]);
    const before = Object.keys(app.store.getState().records.reaction).length;
    k.fireEvent.click(go);
    const dialog = await k.screen.findByRole('dialog', { name: `Delete ${n} records?` }, { timeout: 10_000 });
    expect(dialog.textContent).toContain('One Undo brings everything back');
    k.fireEvent.click(k.within(dialog).getByRole('button', { name: 'Delete' }));
    expect(Object.keys(app.store.getState().records.reaction)).toHaveLength(before - n);
    k.fireEvent.click(k.within(document.querySelector('header') as HTMLElement).getByRole('button', { name: `Undo delete ${n} records` }));
    expect(Object.keys(app.store.getState().records.reaction)).toHaveLength(before);
  });
});

describe('Studio on a phone', () => {
  it('a Select toggle turns a tap into a toggle; the bottom bar has Mark verified (n); Select off clears', async () => {
    const k = loaded.studio;
    asPhone(k);
    const app = await openPhone(k);
    const select = k.screen.getByRole('button', { name: 'Select' });
    expect(select.getAttribute('aria-pressed')).toBe('false');
    k.fireEvent.click(select);
    expect(select.getAttribute('aria-pressed')).toBe('true');
    k.tap(hub(k, 'Alcohols'), { kind: 'touch' });
    k.tap(hub(k, 'Aldehydes'), { kind: 'touch' });
    const bar = k.screen.getByRole('region', { name: 'Selection actions' });
    expect(bar.textContent).toMatch(/2 families selected/);
    k.fireEvent.click(k.within(bar).getByRole('button', { name: /^Mark verified \(\d+\)$/ }));
    await k.waitFor(() => expect(reviews(app).some((one) => one === 'verified')).toBe(true));
    k.fireEvent.click(k.screen.getByRole('button', { name: 'Select' }));
    expect(k.screen.queryByRole('region', { name: 'Selection actions' })).toBeNull();
  });
});

describe('Study has none of it', () => {
  it('Shift-click is a plain click: one selection, no multi-selection line, no bulk buttons', async () => {
    const k = loaded.study;
    const app = k.fakeApp({ state: k.demoState(), navigator: { depictions: true } });
    k.renderWithApp(app);
    await drawing(k);
    k.tap(hub(k, 'Aldehydes'), { shift: true });
    k.tap(hub(k, 'Alcohols'), { shift: true });
    expect(line(k)).toMatch(/^Selected: Alcohols, class hub/);
    expect(k.screen.queryByRole('button', { name: /^Mark verified|^Delete \(/ })).toBeNull();
  });
  it('a Study phone has no Select toggle', async () => {
    const k = loaded.study;
    asPhone(k);
    k.renderWithApp(k.fakeApp({ state: k.demoState(), navigator: { depictions: true } }));
    k.fireEvent.click(k.within(k.screen.getByRole('navigation', { name: 'Home' })).getByRole('button', { name: 'Map' }));
    await drawing(k);
    expect(k.screen.queryByRole('button', { name: 'Select' })).toBeNull();
  });
});
