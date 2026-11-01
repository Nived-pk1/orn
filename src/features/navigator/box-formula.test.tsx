// @vitest-environment jsdom
/** A formula in a substance box breaks only at spaces (7.3c A5). */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BoxFormula, MIN_FORMULA_SCALE } from './family-text';

afterEach(cleanup);

describe('BoxFormula', () => {
  it('a formula without spaces is one unbreakable word', () => {
    const { container } = render(<BoxFormula formula="C6H5–SO2–NHR" />);
    const words = container.querySelectorAll('[data-box-formula] > span > span');
    expect(words).toHaveLength(1);
    expect((words[0] as HTMLElement).style.whiteSpace).toBe('nowrap');
    expect(container.textContent).toBe('C6H5–SO2–NHR');
  });
  it('spaces stay as the only places to break', () => {
    const { container } = render(<BoxFormula formula="Na  OH" />);
    expect(container.querySelectorAll('[data-box-formula] > span > span')).toHaveLength(2);
    expect(container.textContent).toBe('Na OH');
  });
  it('the text never shrinks below 85 %', () => {
    expect(MIN_FORMULA_SCALE).toBe(0.85);
  });
});
