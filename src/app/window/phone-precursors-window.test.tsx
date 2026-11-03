// @vitest-environment jsdom
/**
 * Precursors on a phone (7.2b D1, D2): the Explore tab has a two-choice switch "Reactions | Precursors" (the current one marked, 44 px
 * targets, remembered as the last explorer), the Precursors view is the same one column, and the explorer survives a reload of the state.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERIES } from '@/ui/hooks';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette();
  await import('./reactions-host'); // the lazy view chunks, loaded once so the first test's wait does not include their transform (7.3c)
  await import('./precursors-host');
  await import('./reagents-host');
  await import('./named-host'); // 8.1: the three 7.4 / 7.6 views were not warmed and timed out on a cold transform (the same pattern)
  await import('./mechanisms-host');
  await import('./syllabus-host');
  stubDialog();
  fakeLayout();
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const phone = (): void => {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
};
const explore = (app: FakeApp = fakeApp({ state: demoState() })): FakeApp => {
  phone();
  renderWithApp(app);
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Home' })).getByRole('button', { name: 'Explore' }));
  return app;
};
const switcher = (): HTMLSelectElement => screen.getByRole('combobox', { name: 'Show:' }) as HTMLSelectElement;
const choose = (label: string): void => void fireEvent.change(switcher(), { target: { value: Array.from(switcher().options).find((o) => o.textContent === label)?.value ?? '' } });
const chosen = (): string | undefined => switcher().selectedOptions[0]?.textContent ?? undefined;

describe('the Explore switch', () => {
  it('one native select "Show:" with six choices, Reactions chosen first; Precursors shows Make a compound and is remembered as the last explorer (7.4)', async () => {
    const app = explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    expect(Array.from(switcher().options).map((o) => o.textContent)).toEqual(['Reactions', 'Precursors', 'Reagents', 'Named reactions', 'Mechanisms', 'Syllabus']);
    expect(chosen()).toBe('Reactions');
    choose('Precursors');
    expect(await screen.findByRole('heading', { name: 'Make a compound' })).toBeTruthy();
    expect(app.navigator.ui.explorer.getState().last).toBe('precursors');
    expect(chosen()).toBe('Precursors');
    choose('Reactions');
    expect(await screen.findByRole('heading', { name: 'Reactions' })).toBeTruthy();
    expect(app.navigator.ui.explorer.getState().last).toBe('reactions');
  });

  it.each([
    ['Reagents', 'reagents'],
    ['Named reactions', 'named'],
    ['Mechanisms', 'mechanisms'],
    ['Syllabus', 'syllabus'],
  ] as const)('%s is a choice: its list shows, it is remembered, and the Explore tab reopens it (7.3c E1, 7.4)', async (label, kind) => {
    const app = explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    choose(label);
    expect(await screen.findByRole('region', { name: label })).toBeTruthy();
    expect(app.navigator.ui.explorer.getState().last).toBe(kind);
    expect(chosen()).toBe(label);
    cleanup();
    explore(app);
    expect(await screen.findByRole('region', { name: label })).toBeTruthy();
  });

  it('a saved Reagents page opens on the phone', async () => {
    const app = fakeApp({ state: demoState() });
    app.navigator.ui.reagents.getState().open('rgt_koh');
    app.navigator.ui.explorer.getState().setLast('reagents');
    explore(app);
    expect(await screen.findByRole('heading', { level: 2, name: 'Potassium hydroxide' })).toBeTruthy();
  });

  it('the Explore tab reopens the explorer last used', async () => {
    const app = fakeApp({ state: demoState() });
    app.navigator.ui.explorer.getState().setLast('precursors');
    explore(app);
    expect(await screen.findByRole('heading', { name: 'Make a compound' })).toBeTruthy();
  });

  it('the Precursors view works on the phone: a target, its direct reactions, a search', async () => {
    const app = fakeApp({ state: demoState() });
    app.navigator.ui.precursors.getState().replace({ target: { kind: 'species', id: 'spc_propan-2-ol' }, startFrom: [{ kind: 'species', id: 'spc_ethanol' }] });
    app.navigator.ui.explorer.getState().setLast('precursors');
    explore(app);
    const view = await screen.findByRole('region', { name: 'Precursors' });
    fireEvent.click(within(view).getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getAllByText('2 routes found').length).toBeGreaterThan(0));
  });

  it('the Families tab leaves both explorers', async () => {
    explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Home' })).getByRole('button', { name: 'Families' }));
    await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Show:' })).toBeNull());
  });
});
