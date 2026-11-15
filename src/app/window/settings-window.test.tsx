// @vitest-environment jsdom
/** Step 8.4f, D1: Settings is reachable from the rail (bottom), even before any data is loaded, and shows the exam and backup rows. */
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';
import { prefetchPalette } from './lazy-palette';

beforeAll(async () => {
  await prefetchPalette();
  stubDialog();
  fakeLayout();
});
afterEach(cleanup);

describe('Settings on the window', () => {
  it('the rail has Settings; choosing it shows the page with Appearance, Your exam and Your data', async () => {
    renderWithApp(fakeApp());
    const rail = screen.getByRole('navigation', { name: 'Modes' });
    fireEvent.click(within(rail).getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Reduce motion' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Your exam' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Your data' })).toBeTruthy();
  });

  it('8.4f D6: a change of view restarts the main column opacity fade (the attribute alternates; CSS does the rest, and none with reduced motion)', async () => {
    renderWithApp(fakeApp());
    const column = (): string | null => document.querySelector('[data-fade]')?.getAttribute('data-fade') ?? null;
    const first = column();
    expect(first === 'a' || first === 'b').toBe(true);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { level: 1, name: 'Settings' });
    expect(column()).not.toBe(first);
  });
});
