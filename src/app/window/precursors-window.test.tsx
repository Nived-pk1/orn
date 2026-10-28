// @vitest-environment jsdom
/**
 * The mode rail's Precursors (step 7.2a D): enabled in both editions, it opens the lazy Precursors view over the demo; the target search asks
 * the search service for species and classes only; a search runs through the app's route service; the entry helper opens it for a record.
 */
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';
import { precursorChoiceFor, openPrecursors } from './precursors-entry';
import { PRECURSORS_MODE } from './modes';
import { createNavigatorUiStores } from '@/ui/state';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  (Element.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => undefined;
});
afterEach(cleanup);

const modes = (): HTMLElement => screen.getByRole('navigation', { name: 'Modes' });

describe('the Precursors mode', () => {
  it('is enabled on the rail and opens the view with its prompt', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    const button = within(modes()).getByRole('button', { name: /Precursors/ });
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Make a compound' })).toBeTruthy();
    expect(screen.getByText('Choose the compound you want to make.')).toBeTruthy();
  });

  it('the target search asks for species and classes only', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    fireEvent.click(within(modes()).getByRole('button', { name: /Precursors/ }));
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Compound to make' }), { target: { value: 'eth' } });
    act(() => app.navigator.timers.advance(200));
    const search = app.search as unknown as { mock: { calls: [string, { kinds: string[] }][] } };
    const call = search.mock.calls.find((c) => c[0] === 'precursors');
    expect(call?.[1].kinds).toEqual(['species', 'class']);
  });

  it('a saved target shows its direct reactions, and Search runs through the route service', async () => {
    const app = fakeApp({ state: demoState() });
    app.navigator.ui.precursors.getState().replace({ target: { kind: 'species', id: 'spc_propan-2-ol' }, startFrom: [{ kind: 'species', id: 'spc_ethanol' }] });
    renderWithApp(app);
    fireEvent.click(within(modes()).getByRole('button', { name: /Precursors/ }));
    const view = await screen.findByRole('region', { name: 'Precursors' });
    fireEvent.click(within(view).getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(screen.getAllByText('2 routes found').length).toBeGreaterThan(0));
  });
});

describe('opening Precursors for a record', () => {
  it('a species or a class stands for a target; anything else for none', () => {
    expect(precursorChoiceFor({ kind: 'species', id: 'spc_x' })).toEqual({ kind: 'species', id: 'spc_x' });
    expect(precursorChoiceFor({ kind: 'class', id: 'cls_x' })).toEqual({ kind: 'class', id: 'cls_x' });
    expect(precursorChoiceFor({ kind: 'reagent', id: 'rgt_x' })).toBeUndefined();
  });

  it('opening REPLACES the choices (an old target, start-from and search do not linger), closes a family page and shows the mode', () => {
    const ui = createNavigatorUiStores();
    ui.precursors.getState().replace({ target: { kind: 'species', id: 'spc_old' }, startFrom: [{ kind: 'species', id: 'spc_start' }], maxSteps: 2, onlyListed: true, searched: true });
    ui.family.getState().openFamily('cls_alcohols');
    let mode = '';
    openPrecursors(ui, (next) => (mode = next), { kind: 'species', id: 'spc_phenol' });
    expect(ui.precursors.getState()).toMatchObject({ target: { kind: 'species', id: 'spc_phenol' }, startFrom: [], maxSteps: 5, onlyListed: false, searched: false });
    expect(ui.family.getState().open).toBeNull();
    expect(mode).toBe(PRECURSORS_MODE);
  });
});
