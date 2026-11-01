// @vitest-environment jsdom
/** A formula in a substance box breaks only at spaces (7.3c A5). */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BoxFormula, formulaScale, MIN_FORMULA_SCALE } from './family-text';

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
  it('only a long word shrinks, never below 85 %, with no layout measured', () => {
    expect(MIN_FORMULA_SCALE).toBe(0.85);
    expect([formulaScale(5), formulaScale(14), formulaScale(18), formulaScale(24), formulaScale(60)]).toEqual([1, 1, 0.92, 0.85, 0.85]);
    const { container } = render(<BoxFormula formula="C6H5SO2NHCH2CH2OCH2CH2NH2X" />);
    expect((container.querySelector('[data-box-formula]') as HTMLElement).style.fontSize).toBe('0.85em');
  });
});
