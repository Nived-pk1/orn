/**
 * T4 (step 6.7b, part A): the border glitch at a fieldset legend's right (the Purposes fieldset, 6.5b F2 had fixed only the step
 * kinds) is fixed once, in the shared base style, for every fieldset in every editor: no native border, margin or padding, and a
 * legend with no padding. A fieldset that wants a frame (the condition groups) says so with its own class, which wins.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./base.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bodyOf = (selector: string): string => {
  const at = css.indexOf(`\n${selector} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};

describe('base.css fieldsets (T4)', () => {
  it('a fieldset has no native border, margin or padding and may shrink', () => {
    const body = bodyOf('fieldset');
    expect(body).toMatch(/border:\s*0/);
    expect(body).toMatch(/margin:\s*0/);
    expect(body).toMatch(/padding:\s*0/);
    expect(body).toMatch(/min-width:\s*0/);
  });
  it('a legend has no padding of its own', () => {
    expect(bodyOf('legend')).toMatch(/padding:\s*0/);
  });
});

describe('base.css reduced motion (8.4f D1)', () => {
  const rule = (header: string): string => {
    const at = css.indexOf(header);
    return at < 0 ? '' : css.slice(at, css.indexOf('}', css.indexOf('{', at)));
  };
  it('the Settings switch "Reduce motion" (data-reduce-motion="on") stops animations and transitions exactly as the device setting does', () => {
    const media = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const device = media.slice(media.indexOf('{ ') < 0 ? 0 : 0, media.indexOf('}', media.indexOf('animation-duration')) + 1);
    const setting = rule(':root[data-reduce-motion="on"] *');
    expect(setting).toMatch(/animation-duration:\s*0\.001ms !important/);
    expect(setting).toMatch(/animation-iteration-count:\s*1 !important/);
    expect(setting).toMatch(/transition-duration:\s*0\.001ms !important/);
    expect(setting).toMatch(/scroll-behavior:\s*auto !important/);
    expect(device).toContain('0.001ms');
  });
});
