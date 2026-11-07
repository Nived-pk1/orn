// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Chip } from './chip';

afterEach(cleanup);

describe('Chip', () => {
  it('shows its words and a kind', () => {
    render(<Chip kind="exam">JEE Main</Chip>);
    const chip = screen.getByText('JEE Main');
    expect(chip.getAttribute('data-chip')).toBe('exam');
  });

  it('defaults to neutral', () => {
    render(<Chip>1 caveat</Chip>);
    expect(screen.getByText('1 caveat').getAttribute('data-chip')).toBe('neutral');
  });

  it('a family chip carries its tone', () => {
    render(<Chip kind="family" tone="teal">Alcohols</Chip>);
    const chip = screen.getByText('Alcohols');
    expect(chip.getAttribute('data-chip')).toBe('family');
    expect(chip.getAttribute('data-tone')).toBe('teal');
  });

  it('a status chip is still text (colour is never the carrier)', () => {
    render(<Chip kind="status">provisional</Chip>);
    expect(screen.getByText('provisional').textContent).toBe('provisional');
  });
});
