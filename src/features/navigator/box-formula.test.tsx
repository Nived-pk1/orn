// @vitest-environment jsdom
/** A formula in a substance box keeps its size and wraps at a space or after a bond dash, never inside a group (7.3c A5; step 8.5d R3). */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BoxFormula } from './family-text';

afterEach(cleanup);
const parts = (container: HTMLElement): string[] => [...container.querySelectorAll('[data-box-formula] span[style]')].map((part) => part.textContent ?? '');

describe('BoxFormula', () => {
  it('a formula wraps after a bond dash only: each part is unbreakable, with a break opportunity between them', () => {
    const { container } = render(<BoxFormula formula="CH3COO-CH2-CH2-R" />);
    expect(parts(container)).toEqual(['CH3COO-', 'CH2-', 'CH2-', 'R']);
    expect(container.querySelectorAll('wbr')).toHaveLength(3);
    expect(container.textContent).toBe('CH3COO-CH2-CH2-R');
    expect((container.querySelector('[data-box-formula]') as HTMLElement).style.whiteSpace).toBe('');
  });
  it('an en dash is a bond dash too, and a group is never cut', () => {
    const { container } = render(<BoxFormula formula="C6H5–SO2–NHR" />);
    expect(parts(container)).toEqual(['C6H5–', 'SO2–', 'NHR']);
  });
  it('spaces stay places to break', () => {
    const { container } = render(<BoxFormula formula="Na  OH" />);
    expect(parts(container)).toEqual(['Na', 'OH']);
    expect(container.textContent).toBe('Na OH');
  });
  it('a long formula keeps its font size (never shrunk): the box grows instead', () => {
    const { container } = render(<BoxFormula formula="C6H5SO2NHCH2CH2OCH2CH2NH2X" />);
    expect((container.querySelector('[data-box-formula]') as HTMLElement).style.fontSize).toBe('');
  });
});
