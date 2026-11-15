// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModeRail, type ModeItem } from './mode-rail';

afterEach(cleanup);
const modes: readonly ModeItem[] = [
  { id: 'map', label: 'Map', icon: 'map', group: 'study' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'app' },
];

describe('ModeRail: the app group (step 8.4f, D1)', () => {
  it('Settings is a rail item with its gear icon, below the Study group, and opens its mode', () => {
    const onChange = vi.fn();
    render(<ModeRail modes={modes} active="map" onChange={onChange} onCollapse={() => undefined} />);
    const study = screen.getByRole('group', { name: 'Study' });
    expect(within(study).queryByRole('button', { name: 'Settings' })).toBeNull();
    const settings = screen.getByRole('button', { name: 'Settings' });
    expect(settings.querySelector('[style*="settings.svg"]')).not.toBeNull();
    // it comes after the Study group in the document, and before Collapse
    const all = screen.getAllByRole('button').map((b) => b.textContent);
    expect(all.indexOf('Settings')).toBeGreaterThan(all.indexOf('Map'));
    expect(all.indexOf('Settings')).toBeLessThan(all.findIndex((t) => t?.includes('Collapse')));
    fireEvent.click(settings);
    expect(onChange).toHaveBeenCalledWith('settings');
  });
  it('it is the current page when its mode is active, and keeps its name when the rail is collapsed', () => {
    render(<ModeRail modes={modes} active="settings" onChange={() => undefined} collapsed />);
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe('page');
  });
});
