// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Count } from './count';

afterEach(cleanup);

describe('Count (step 8.4d, Part D): the small number badge', () => {
  it('shows the number and nothing else', () => {
    render(<Count value={4} />);
    expect(screen.getByText('4').tagName).toBe('SPAN');
  });
  it('is cut to "99+" past 99, and says the true number to assistive technology', () => {
    render(<Count value={140} />);
    expect(screen.getByText('99+')).not.toBeNull();
    expect(screen.getByText('140 in all', { selector: 'span' })).not.toBeNull();
  });
  it('zero shows 0 (a count that is there is never hidden); a negative or fractional number is not a count', () => {
    const { container, rerender } = render(<Count value={0} />);
    expect(container.textContent).toBe('0');
    rerender(<Count value={-3} />);
    expect(container.textContent).toBe('0');
    rerender(<Count value={2.7} />);
    expect(container.textContent).toBe('2');
  });
});
