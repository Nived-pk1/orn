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
const switchBox = (): HTMLElement => screen.getByRole('group', { name: 'Explorer' });

describe('the Explore switch', () => {
  it('two choices, Reactions marked first; Precursors shows Make a compound and is remembered as the last explorer', async () => {
    const app = explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    const reactions = within(switchBox()).getByRole('button', { name: 'Reactions' });
    const precursors = within(switchBox()).getByRole('button', { name: 'Precursors' });
    expect(reactions.getAttribute('aria-pressed')).toBe('true');
    expect(precursors.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(precursors);
    expect(await screen.findByRole('heading', { name: 'Make a compound' })).toBeTruthy();
    expect(app.navigator.ui.explorer.getState().last).toBe('precursors');
    expect(within(switchBox()).getByRole('button', { name: 'Precursors' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(switchBox()).getByRole('button', { name: 'Reactions' }));
    expect(await screen.findByRole('heading', { name: 'Reactions' })).toBeTruthy();
    expect(app.navigator.ui.explorer.getState().last).toBe('reactions');
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
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Explorer' })).toBeNull());
  });
});
