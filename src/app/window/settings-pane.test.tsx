// @vitest-environment jsdom
/** Step 8.4g, G10: Settings closes the inspector pane (it comes back with the view that has a selection) and the breadcrumb says Settings only. */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeLayout } from '@/test-support/inspector-kit';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette();
  stubDialog();
  fakeLayout();
});
afterEach(cleanup);

const shell = (): Element | null => document.querySelector('[data-inspector]');
const crumb = (): string => screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent ?? '';

describe('Settings and the pane (G10)', () => {
  it('closes the pane in Settings and reopens it in a view with a selection', async () => {
    const app = fakeApp({ state: demoState(), panels: { stored: { inspectorOpen: true } } });
    renderWithApp(app);
    await screen.findByRole('group', { name: /^Navigator:/ });
    const [speciesId] = Object.keys(demoState().records.species);
    act(() => app.value.inspector.ui.inspector.getState().open({ kind: 'species', id: speciesId as string }));
    expect(shell()?.getAttribute('data-inspector')).toBe('open');
    expect(crumb()).not.toBe('Map');
    const rail = screen.getByRole('navigation', { name: 'Modes' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(shell()?.getAttribute('data-inspector')).toBe('closed');
    expect(crumb()).toBe('Settings');
    expect(document.title).toBe('Settings · ORN');
    fireEvent.click(within(rail).getByRole('button', { name: 'Map' }));
    await screen.findByRole('group', { name: /^Navigator:/ });
    expect(shell()?.getAttribute('data-inspector')).toBe('open');
  });
});
