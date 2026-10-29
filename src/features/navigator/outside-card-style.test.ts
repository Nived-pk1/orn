/**
 * An outside-scope card fades only its DRAWINGS (7.2b A2): faded text fails the colour-contrast rule, so no rule that fades a wrapper of
 * text may exist. The source of the two style sheets is read because jsdom does not apply CSS modules.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (name: string): string => readFileSync(new URL(name, import.meta.url), 'utf8');

/** The declaration blocks whose selector matches, as [selector, body]. */
function rules(css: string): readonly (readonly [string, string])[] {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [(m[1] ?? '').trim(), m[2] ?? ''] as const);
}

describe('outside card style', () => {
  it('does not fade the wrapper that holds the names and the arrow text', () => {
    const page = rules(read('./family-page.module.css'));
    const fading = page.filter(([selector, body]) => /opacity\s*:\s*0?\.\d/.test(body) && /dimmed|outside/i.test(selector));
    expect(fading).toEqual([]);
  });

  it('fades the drawings (structure images and the arrow line) of a card marked outside', () => {
    const css = read('./family-scheme.module.css');
    const faded = rules(css).filter(([selector, body]) => /\[data-outside\]/.test(selector) && /opacity\s*:\s*0?\.\d/.test(body));
    const text = faded.map(([selector]) => selector).join(' ');
    expect(text).toMatch(/img/);
    expect(text).toMatch(/arrowLine/);
  });
});
