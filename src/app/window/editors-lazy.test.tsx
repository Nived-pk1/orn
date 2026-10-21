// @vitest-environment jsdom
/**
 * The editors' entry points load AFTER the first paint (entry room, exams step part A): the window shows no "New ..." button until the
 * scheduler has run and the lazy chunk has loaded, then shows all of them, and each opens a blank editor of its kind.
 */
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import type { ManualTimers } from '@/test-support/navigator-kit';
import { fakeApp, renderWithApp, stubDialog } from '@/test-support/window-kit';

beforeAll(() => {
  stubDialog();
  fakeLayout();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the editors load after the first paint', () => {
  it('no "New ..." button before the scheduler runs; all of them after; one opens its editor', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp({ ...app, value: { ...app.value, editorEntries: undefined } } as unknown as typeof app);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Modes' })).getByRole('button', { name: /Workbench/ }));
    expect(screen.queryByRole('button', { name: 'New species' })).toBeNull();
    await act(async () => {
      (app.inspector.timers as unknown as ManualTimers).advance(10);
    });
    expect(await screen.findByRole('button', { name: 'New species' })).toBeTruthy();
    for (const name of ['New class', 'New topic', 'New map family']) expect(screen.getByRole('button', { name })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New topic' }));
    expect(await screen.findByRole('dialog', { name: 'New topic' })).toBeTruthy();
  });
});
