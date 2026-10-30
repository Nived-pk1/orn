/**
 * K1 (step 6.6b, Part A): an input inside the open editor of a summary row must not take the row's flex basis (the row is a flex row
 * where `.row input` gets `flex: 1 1 12rem`; inside the open column of fields that basis became a HEIGHT of 12rem and more). The CSS
 * must say, after the row's rule, that fields inside a row keep their natural size and that the open editor takes the whole row.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./editor.module.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bodyOf = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('editor.module.css (K1)', () => {
  it('fields inside a row keep their natural size, and the rule comes after the row input rule', () => {
    expect(bodyOf('.row .field input')).toMatch(/flex:\s*none/);
    expect(css.indexOf('\n.row .field input {')).toBeGreaterThan(css.indexOf('\n.row input {'));
  });
  it('selects and textareas inside a row keep their natural size too', () => {
    expect(bodyOf('.row .field select')).toMatch(/flex:\s*none/);
  });
  it('the open editor takes the whole row', () => {
    expect(bodyOf('.row > .field')).toMatch(/flex:\s*1 1 100%/);
  });
});

const stepCss = readFileSync(new URL('./route-steps.module.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const stepBody = (selector: string): string => {
  const at = stepCss.indexOf(`\n${selector} {`);
  return at < 0 ? '' : stepCss.slice(at, stepCss.indexOf('}', at));
};

describe('route-steps.module.css (7.3a A2)', () => {
  it('the step summary takes its own line and the four buttons stay on ONE row that never wraps', () => {
    expect(stepBody('.stepSummary')).toMatch(/flex:\s*1 1 100%/);
    expect(stepBody('.stepActions')).toMatch(/flex-wrap:\s*nowrap/);
  });
  it('a question in the button row may wrap, so Keep and Remove are never cut off', () => {
    expect(stepCss).toMatch(/\.stepActions\[data-asking='true'\]\s*\{[^}]*flex-wrap:\s*wrap/);
  });
  it('on a phone the buttons are stacked, 44 px high', () => {
    expect(stepBody('.stepActionsPhone')).toMatch(/flex-direction:\s*column/);
    expect(stepCss).toMatch(/\.stepActionsPhone button\s*\{[^}]*min-height:\s*44px/);
  });
});
