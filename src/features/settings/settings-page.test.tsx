// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppearanceStore } from '@/ui/state';
import { SettingsPage } from './settings-page';

afterEach(cleanup);
const timers = { after: () => () => undefined };
const store = (stored?: unknown) => createAppearanceStore({ stored, mode: () => 'writable', save: () => Promise.resolve() }, timers);

describe('SettingsPage', () => {
  it('has the Appearance, Your exam and Your data groups, each row with a one-line explanation, and no Text size or Density yet', () => {
    render(<SettingsPage appearance={store()} exam={<span>JEE Main chip</span>} onBackUp={() => undefined} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy();
    for (const name of ['Appearance', 'Your exam', 'Your data']) expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
    expect(screen.queryByText(/Text size/i)).toBeNull();
    expect(screen.queryByText(/Density/i)).toBeNull();
    expect(screen.getByText('JEE Main chip')).toBeTruthy();
  });
  it('Theme is Light / System / Dark with System chosen by default; choosing Dark changes the store', () => {
    const s = store();
    render(<SettingsPage appearance={s} exam={null} onBackUp={() => undefined} />);
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect((within(group).getByLabelText('System') as HTMLInputElement).checked).toBe(true);
    expect(within(group).getAllByRole('radio').map((r) => (r as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Light', 'System', 'Dark']);
    fireEvent.click(within(group).getByLabelText('Dark'));
    expect(s.getState().theme).toBe('dark');
  });
  it('Reduce motion is a switch; turning it on changes the store', () => {
    const s = store();
    render(<SettingsPage appearance={s} exam={null} onBackUp={() => undefined} />);
    const sw = screen.getByRole('switch', { name: 'Reduce motion' }) as HTMLInputElement;
    expect(sw.checked).toBe(false);
    act(() => void fireEvent.click(sw));
    expect(s.getState().reduceMotion).toBe(true);
    expect((screen.getByRole('switch', { name: 'Reduce motion' }) as HTMLInputElement).checked).toBe(true);
  });
  it('Back up calls the backup action; without one the button is not shown', () => {
    const run = vi.fn();
    const { rerender } = render(<SettingsPage appearance={store()} exam={null} onBackUp={run} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up' }));
    expect(run).toHaveBeenCalledTimes(1);
    rerender(<SettingsPage appearance={store()} exam={null} />);
    expect(screen.queryByRole('button', { name: 'Back up' })).toBeNull();
  });
  it('a read-only tab says the choice is kept for this session only', () => {
    const s = createAppearanceStore({ stored: undefined, mode: () => 'read_only', save: () => Promise.resolve() }, timers);
    render(<SettingsPage appearance={s} exam={null} />);
    expect(screen.getByText(/kept for this session only/i)).toBeTruthy();
  });
});
