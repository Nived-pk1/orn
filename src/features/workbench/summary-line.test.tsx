// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
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
  it('E2: the text is in one element of its own (so the buttons can sit under it on a phone) and the parts sit on the text baseline', () => {
    render(<span data-testid="line"><SummaryLine text="A · B" /></span>);
    expect(screen.getByTestId('line').querySelectorAll('[data-summary-text]')).toHaveLength(1);
    expect(screen.getByTestId('line').querySelector('[data-summary-text]')?.textContent).toBe('A · B');
  });
  it('E2 (css): parts align on the baseline; on a phone the text takes its own line', () => {
    const css = readFileSync('src/features/workbench/step-fields.module.css', 'utf8').replace(/\r\n/g, '\n');
    const at = css.indexOf('\n.part {');
    const part = css.slice(at, css.indexOf('}', at));
    expect(part).toMatch(/vertical-align:\s*baseline/);
    expect(part).not.toMatch(/vertical-align:\s*top/);
    const phone = css.slice(css.indexOf('@media (max-width: 899px)'));
    expect(phone).toMatch(/\.summaryText\s*\{[^}]*display:\s*block/);
    expect(phone).toMatch(/\.summaryText\s*\{[^}]*flex:\s*1 1 100%/);
  });
});
