// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from './empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  it('is one sentence and nothing else when there is no action', () => {
    const { container } = render(<EmptyState>No reactions yet.</EmptyState>);
    expect(screen.getByText('No reactions yet.')).toBeTruthy();
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelector('[data-empty-state]')).not.toBeNull();
  });
  it('has at most one quiet button, and it runs the action', () => {
    const run = vi.fn();
    const { container } = render(<EmptyState action={{ label: 'Clear filters', onClick: run }}>Nothing matches.</EmptyState>);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('can sit inline in a panel (a status line) or stand as a page area; the sentence is the accessible name of nothing extra', () => {
    render(<EmptyState inline>No chain within JEE Main.</EmptyState>);
    expect(screen.getByText('No chain within JEE Main.').closest('[data-empty-state]')?.getAttribute('data-inline')).toBe('');
  });
});
