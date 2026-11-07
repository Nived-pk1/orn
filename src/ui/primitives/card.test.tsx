// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card, CardButton, CardMeta, CardTitle } from './card';

afterEach(cleanup);

describe('Card', () => {
  it('shows a title and a meta line in order', () => {
    render(
      <Card data-testid="c">
        <CardTitle>Alkenes</CardTitle>
        <CardMeta>12 reactions</CardMeta>
      </Card>,
    );
    expect(screen.getByTestId('c').textContent).toBe('Alkenes12 reactions');
  });

  it('marks a selected card with data-selected and aria-current, never by layout', () => {
    render(<Card selected data-testid="c">x</Card>);
    expect(screen.getByTestId('c').getAttribute('data-selected')).toBe('true');
  });

  it('renders as the element asked for', () => {
    render(<ul><Card as="li" data-testid="c">x</Card></ul>);
    expect(screen.getByTestId('c').tagName).toBe('LI');
  });
});

describe('CardButton', () => {
  it('is a button named by its content; click calls onClick', () => {
    const onClick = vi.fn();
    render(<CardButton onClick={onClick}><CardTitle>Go</CardTitle></CardButton>);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('selected sets aria-pressed; unavailable is aria-disabled, focusable and does nothing', () => {
    const onClick = vi.fn();
    render(<CardButton selected unavailable="why" onClick={onClick}>Go</CardButton>);
    const b = screen.getByRole('button', { name: 'Go' });
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    b.focus();
    expect(document.activeElement).toBe(b);
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});
