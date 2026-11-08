/**
 * Tokens v2 (step 8.4d, Part A): the app's token file carries every token of the design reference (docs/design/ORN_DESIGN_REFERENCE.html)
 * in BOTH themes with the reference's values, the two themes define the same names, the page starts in the light theme, there is one
 * global focus ring, and reduced motion zeroes every duration. Dark is defined here and switched on in step 8.4f.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), 'utf8');
const REFERENCE = read('../../../docs/design/ORN_DESIGN_REFERENCE.html');
const TOKENS = read('./tokens.css');
const BASE = read('./base.css');
const INDEX = read('../../../index.html');

const noComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the rule whose selector starts with `selector` (first match). */
function block(css: string, selector: string, optional = false): Map<string, string> {
  const text = noComments(css);
  const at = text.indexOf(`${selector} {`) >= 0 ? text.indexOf(`${selector} {`) : text.indexOf(`${selector}{`);
  if (at < 0) {
    if (optional) return new Map();
    throw new Error(`no rule ${selector}`);
  }
  const open = text.indexOf('{', at);
  const close = text.indexOf('}', open);
  const out = new Map<string, string>();
  for (const m of text.slice(open + 1, close).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1] as string, (m[2] as string).trim().replace(/\s+/g, ''));
  return out;
}

const REF_LIGHT = block(REFERENCE, ':root, [data-theme="light"]');
const REF_DARK = block(REFERENCE, '[data-theme="dark"]');
const APP_LIGHT = block(TOKENS, ':root, [data-theme="light"]', true);
const APP_DARK = block(TOKENS, '[data-theme="dark"]', true);

describe('tokens v2: the reference themes', () => {
  it('the reference parses (guards the parser)', () => {
    expect(REF_LIGHT.size).toBeGreaterThan(40);
    expect(REF_DARK.size).toBeGreaterThan(30);
  });

  it('every reference token is in the light theme with the reference value', () => {
    for (const [name, value] of REF_LIGHT) expect([name, APP_LIGHT.get(name)]).toEqual([name, value]);
  });

  it('every reference dark token is in the dark theme with the reference value', () => {
    for (const [name, value] of REF_DARK) expect([name, APP_DARK.get(name)]).toEqual([name, value]);
  });

  it('light and dark define the same token names (a theme is complete)', () => {
    expect([...APP_DARK.keys()].sort()).toEqual([...APP_LIGHT.keys()].sort());
  });

  it('the page starts in the light theme; dark is not switched on yet', () => {
    expect(INDEX).toMatch(/<html[^>]*data-theme="light"/);
    expect(INDEX).toMatch(/name="color-scheme" content="light"/);
  });
});

describe('tokens v2: type, space, radius, motion, focus', () => {
  const ROOT = block(TOKENS, ':root');
  it('has the reference names for type roles, space, radius, motion and control heights', () => {
    const names = ['--font', '--mono', '--t-12', '--t-14', '--t-16', '--t-20', '--t-24', '--t-32', '--s-4', '--s-8', '--s-12', '--s-16', '--s-24', '--s-32', '--s-48', '--r-control', '--r-card', '--r-panel', '--r-pill', '--d-fast', '--d-base', '--d-slow', '--ease-out', '--ease-in-out', '--h-sm', '--h-md', '--h-touch'];
    for (const name of names) expect([name, ROOT.has(name) || APP_LIGHT.has(name)]).toEqual([name, true]);
  });

  it('motion is 120 / 180 / 260 ms and every duration is 0 under reduced motion', () => {
    expect(TOKENS).toMatch(/--d-fast:\s*120ms/);
    expect(TOKENS).toMatch(/--d-base:\s*180ms/);
    expect(TOKENS).toMatch(/--d-slow:\s*260ms/);
    const media = TOKENS.slice(TOKENS.indexOf('prefers-reduced-motion'));
    for (const name of ['--d-fast', '--d-base', '--d-slow', '--motion-fast', '--motion-slow']) expect(media).toMatch(new RegExp(`${name}:\\s*0ms`));
  });

  it('there is one global focus ring, drawn from the --focus token', () => {
    const rules = [...noComments(BASE).matchAll(/(^|\n)\s*:focus-visible\s*\{([^}]*)\}/g)];
    expect(rules).toHaveLength(1);
    expect(rules[0]?.[2]).toMatch(/box-shadow:\s*var\(--focus\)/);
  });

  it('counts, tables and the status bar use tabular figures (set once, on the body)', () => {
    expect(noComments(BASE)).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });
});

describe('tokens v2: no raw colour outside the token file', () => {
  it('npm run check:colours passes (hex, rgb(a), hsl and named colours in CSS and presentation code)', () => {
    expect(() => execFileSync(process.execPath, ['scripts/check-colours.mjs'], { cwd: new URL('../../../', import.meta.url), stdio: 'pipe' })).not.toThrow();
  });
});
