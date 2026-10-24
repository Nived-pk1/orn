// @vitest-environment jsdom
/**
 * The Reactions view on a phone (step 7.1b E1, ADR-042 E8) through the real window on the demo: the Explore tab opens Reactions, its
 * heading is "Reactions", the filters sit behind "Filters (n)" in a full-screen sheet with a "Show <n> reactions" button, one column of
 * cards, the Explore tab is remembered, and Families brings the family list back.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
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
const tabs = (): HTMLElement => screen.getByRole('navigation', { name: 'Home' });
const explore = (app: FakeApp = fakeApp({ state: demoState() })): FakeApp => {
  phone();
  renderWithApp(app);
  fireEvent.click(within(tabs()).getByRole('button', { name: 'Explore' }));
  return app;
};

describe('the Explore tab', () => {
  it('opens Reactions: the heading, the count, one list of cards, the tab marked current', async () => {
    explore();
    expect(await screen.findByRole('heading', { name: 'Reactions' })).toBeTruthy();
    expect(within(tabs()).getByRole('button', { name: 'Explore' }).getAttribute('aria-current')).toBe('page');
    expect(within(tabs()).getByRole('button', { name: 'Families' }).getAttribute('aria-current')).toBeNull();
    expect((await screen.findAllByText(/^\d+ reactions$/)).length).toBeGreaterThan(0);
    expect(document.querySelectorAll('article[data-reaction-id]').length).toBeGreaterThan(10);
  });

  it('is remembered: the phone tab is explore in the UI state', async () => {
    const app = explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    expect(app.navigator.ui.overview.getState().phoneTab).toBe('explore');
  });

  it('Families brings the family list back', async () => {
    explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    fireEvent.click(within(tabs()).getByRole('button', { name: 'Families' }));
    expect(screen.queryByRole('heading', { name: 'Reactions' })).toBeNull();
    expect(within(tabs()).getByRole('button', { name: 'Families' }).getAttribute('aria-current')).toBe('page');
  });

  it('starts on Reactions when Explore was the remembered tab', async () => {
    phone();
    const app = fakeApp({ state: demoState() });
    app.navigator.ui.overview.getState().setPhoneTab('explore');
    renderWithApp(app);
    expect(await screen.findByRole('heading', { name: 'Reactions' })).toBeTruthy();
  });
});

describe('the Filters sheet', () => {
  it('the filter buttons are behind "Filters (n)"; the sheet has a section per filter and "Show <n> reactions" closes it', async () => {
    explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    expect(screen.queryByRole('button', { name: 'Type' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filters (0)' }));
    const sheet = await screen.findByRole('dialog', { name: 'Filters' });
    for (const title of ['Substance', 'From family', 'To family', 'Type', 'Named reaction', 'Review status']) expect(within(sheet).getByRole('heading', { name: title })).toBeTruthy();
    const box = within(sheet).getAllByRole('checkbox', { name: /^Oxidation \(\d+\)$/ })[0] as HTMLElement;
    fireEvent.click(box);
    const show = within(sheet).getByRole('button', { name: /^Show \d+ reactions?$/ });
    const n = Number(/\d+/.exec(show.textContent ?? '')?.[0]);
    expect(n).toBeGreaterThan(0);
    fireEvent.click(show);
    expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeTruthy();
    expect(document.querySelectorAll('[data-reaction-id]')).toHaveLength(n);
  });

  it('a chip removes a filter on the phone too', async () => {
    const app = explore();
    await screen.findByRole('heading', { name: 'Reactions' });
    act(() => app.navigator.ui.explorer.getState().setFilter({ text: 'pcc' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Name: pcc' }));
    expect(app.navigator.ui.explorer.getState().filter.text).toBe('');
  });
});
