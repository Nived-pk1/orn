// @vitest-environment jsdom
/**
 * The mode rail's Reactions (step 7.1b D): enabled in both editions, it opens the lazy Reactions view over the demo; a card selects its
 * reaction and the inspector shows it; the substance search asks the search service for species, classes and reagents only.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp } from '@/test-support/window-kit';

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

describe('the Reactions mode', () => {
  it('is enabled on the rail and opens the view', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    const button = within(modes()).getByRole('button', { name: /Reactions/ });
    expect(button.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Reactions' })).toBeTruthy();
    expect((await screen.findAllByText(/^\d+ reactions$/)).length).toBeGreaterThan(0);
  });

  it('a card selects its reaction: the inspector shows it', async () => {
    renderWithApp(fakeApp({ state: demoState() }));
    fireEvent.click(within(modes()).getByRole('button', { name: /Reactions/ }));
    const list = await screen.findByRole('list', { name: 'Reactions' });
    const first = within(list).getAllByRole('button').find((b) => b.closest('[data-reaction-id]') !== null) as HTMLElement;
    const id = first.closest('[data-reaction-id]')?.getAttribute('data-reaction-id');
    fireEvent.click(first);
    expect(within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('article', { name: 'Record' }).getAttribute('data-record-id')).toBe(id);
  });

  it('the substance search asks for species, classes and reagents only', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app);
    fireEvent.click(within(modes()).getByRole('button', { name: /Reactions/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Substance' }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a species, class or reagent' }), { target: { value: 'eth' } });
    act(() => app.navigator.timers.advance(200));
    const search = app.search as unknown as { mock: { calls: [string, { kinds: string[] }][] } };
    const call = search.mock.calls.find((c) => c[0] === 'explorer');
    expect(call?.[1].kinds).toEqual(['species', 'class', 'reagent']);
  });
});
