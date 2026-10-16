// @vitest-environment jsdom
/** The drawn arrow of a full equation: a line and a head, both texts centred over and under it, no arrow character, empty texts allowed. */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { EquationArrow } from './equation-arrow';

afterEach(cleanup);

describe('EquationArrow', () => {
  it('draws a shaft and a head and holds the texts over and under; the characters of the arrow are not in the text', () => {
    const { container } = render(<EquationArrow above="NaOH" below="heat" />);
    const arrow = container.querySelector('[data-equation-arrow]') as HTMLElement;
    expect(arrow.querySelector('[data-equation-above]')?.textContent).toBe('NaOH');
    expect(arrow.querySelector('[data-equation-below]')?.textContent).toBe('heat');
    expect(arrow.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
    expect(arrow.textContent).toBe('NaOHheat');
    expect(arrow.querySelector('[aria-hidden="true"]')).not.toBeNull(); // the line is decoration: the equation's own name carries the arrow
  });

  it('is still drawn with no text at all', () => {
    const { container } = render(<EquationArrow />);
    expect(container.querySelector('[data-equation-arrow] svg')).not.toBeNull();
    expect(container.querySelector('[data-equation-above]')?.textContent).toBe('');
  });
});
