// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PageSkeleton } from './page-skeleton';

afterEach(cleanup);

describe('PageSkeleton (8.4f D4: a lazy view shows the shape of what is coming, never a blank area or a spinner)', () => {
  it('is a busy status region said in words, with decorative blocks only', () => {
    const { container } = render(<PageSkeleton label="Loading the reactions" />);
    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.textContent).toBe('Loading the reactions');
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(4);
  });
  it('the list shape has a title, a filter row and cards; the rows shape has grouped rows', () => {
    const { container, rerender } = render(<PageSkeleton label="x" />);
    expect(container.querySelectorAll('[data-sk="card"]').length).toBe(4);
    expect(container.querySelector('[data-sk="title"]')).not.toBeNull();
    rerender(<PageSkeleton label="x" shape="rows" />);
    expect(container.querySelectorAll('[data-sk="row"]').length).toBe(3);
    expect(container.querySelectorAll('[data-sk="card"]').length).toBe(0);
  });
});
