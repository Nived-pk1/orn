// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { stubDialog } from '@/test-support/window-kit';
import { openShortcuts, shortcutsStore } from './shortcuts-state';
import { ShortcutsHost } from './shortcuts-host';

beforeAll(() => stubDialog());
afterEach(() => {
  cleanup();
  shortcutsStore.setState({ open: false });
});

const flush = (): Promise<void> => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

describe('the shortcuts sheet (step 8.4g Part B, G5)', () => {
  it('"?" opens it, and it lists the groups made from the key map', async () => {
    render(<><input aria-label="field" /><ShortcutsHost studio /></>);
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    await flush();
    for (const group of ['Anywhere', 'Map', 'Lists', 'Studio']) expect(within(dialog).getByRole('heading', { name: group })).toBeTruthy();
    expect(within(dialog).getByText('Search records and commands')).toBeTruthy();
    expect(within(dialog).getByText('Zoom in')).toBeTruthy();
  });

  it('the Study edition has no Studio group', async () => {
    render(<ShortcutsHost studio={false} />);
    act(() => openShortcuts());
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    await flush();
    expect(within(dialog).queryByRole('heading', { name: 'Studio' })).toBeNull();
  });

  it('"?" typed in a text field is just a character', async () => {
    render(<><input aria-label="field" /><ShortcutsHost studio={false} /></>);
    fireEvent.keyDown(screen.getByLabelText('field'), { key: '?', shiftKey: true });
    await flush();
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });
});
