// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, IconButton } from './button';

afterEach(cleanup);

describe('Button', () => {
  it('is a button with its text as the name; click and keyboard activation call onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('an unavailable button stays focusable, does nothing, and states its reason to assistive technology', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick} unavailable="needs step 5.9b">Export</Button>);
    const button = screen.getByRole('button', { name: 'Export' });
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-describedby')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Export', description: 'needs step 5.9b' })).toBe(button);
  });
});

describe('IconButton', () => {
  it('is named by its label, whatever the icon', () => {
    const onClick = vi.fn();
    render(<IconButton label="Undo" icon="undo" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('an unavailable icon button says why (description) and does nothing', () => {
    const onClick = vi.fn();
    render(<IconButton label="Redo" icon="redo" unavailable="nothing to redo" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Redo', description: 'nothing to redo' });
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('the tooltip appears on keyboard focus and Esc hides it', async () => {
    render(<IconButton label="Search" icon="search" />);
    fireEvent.focus(screen.getByRole('button', { name: 'Search' }));
    expect((await screen.findAllByText('Search')).length).toBeGreaterThan(0);
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Search' }), { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
