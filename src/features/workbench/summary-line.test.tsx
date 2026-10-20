// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SummaryLine } from './summary-line';

afterEach(cleanup);

describe('SummaryLine', () => {
  it('keeps the text exactly and wraps each part " · " separates in its own element, so a part never breaks inside', () => {
    render(<span data-testid="line"><SummaryLine text="Base-catalysed · 3 steps · In dilute alkali" /></span>);
    expect(screen.getByTestId('line').textContent).toBe('Base-catalysed · 3 steps · In dilute alkali');
    const parts = screen.getByTestId('line').querySelectorAll('[data-summary-part]');
    expect([...parts].map((p) => p.textContent)).toEqual(['Base-catalysed', '3 steps', 'In dilute alkali']);
  });
  it('a text with no separator is one part; an empty text is nothing', () => {
    render(<span data-testid="line"><SummaryLine text="Step 1" /></span>);
    expect(screen.getByTestId('line').querySelectorAll('[data-summary-part]')).toHaveLength(1);
    cleanup();
    render(<span data-testid="line"><SummaryLine text="" /></span>);
    expect(screen.getByTestId('line').textContent).toBe('');
  });
});
