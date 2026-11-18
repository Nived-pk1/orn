// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StarButton } from './star-button';
import type { StarsPort } from './contracts';

afterEach(cleanup);

function port(): StarsPort & { on: Set<string> } {
  const on = new Set<string>();
  const listeners = new Set<() => void>();
  return {
    on,
    isStarred: (ref) => on.has(ref.id),
    toggle: (ref) => {
      if (on.has(ref.id)) on.delete(ref.id);
      else on.add(ref.id);
      listeners.forEach((l) => l());
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

describe('StarButton (step 8.4g Part B, G2)', () => {
  it('is "Star for revision", pressed when the record is starred, and toggles', () => {
    const stars = port();
    render(<StarButton stars={stars} refOf={{ kind: 'reaction', id: 'a' }} />);
    const button = screen.getByRole('button', { name: 'Star for revision' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(stars.on.has('a')).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('follows another record when the inspector shows one', () => {
    const stars = port();
    stars.on.add('b');
    const view = render(<StarButton stars={stars} refOf={{ kind: 'reaction', id: 'a' }} />);
    expect(screen.getByRole('button', { name: 'Star for revision' }).getAttribute('aria-pressed')).toBe('false');
    view.rerender(<StarButton stars={stars} refOf={{ kind: 'reaction', id: 'b' }} />);
    expect(screen.getByRole('button', { name: 'Star for revision' }).getAttribute('aria-pressed')).toBe('true');
  });
});
