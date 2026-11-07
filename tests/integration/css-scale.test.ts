/**
 * Visual scale guard (step 8.4a, Part A): every font-size, padding, margin, gap and border-radius in `src/**` CSS is a token
 * (--text-N, --space-N, --radius-*), 0, auto, inherit, or a calc() of tokens. Exceptions live in css-scale-exceptions.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCALE_EXCEPTIONS } from './css-scale-exceptions';

const TEXT = ['12', '14', '16', '20', '24', '32'];
const SPACE = ['4', '8', '12', '16', '24', '32', '48'];
const RADIUS = ['4', '8', 'pill'];
const TOKEN = new RegExp(`^var[(]--(?:text-(?:${TEXT.join('|')})|space-(?:${SPACE.join('|')})|radius-(?:${RADIUS.join('|')}))[)]$`);
const KEYWORD = /^(?:0|auto|inherit|initial|unset|normal)$/;
const PROP = /(?:^|[\s;{])((?:font-size|padding(?:-[a-z]+)*|margin(?:-[a-z]+)*|gap|row-gap|column-gap|border-radius|border-[a-z]+-[a-z]+-radius))\s*:\s*([^;}]+)/g;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [];
  });
}

/** Split on top-level whitespace (not inside parentheses). */
function parts(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of value.trim()) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (/\s/.test(ch) && depth === 0) {
      if (cur !== '') out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur !== '') out.push(cur);
  return out;
}

const calcOfTokens = (v: string): boolean => /^calc\(/.test(v) && !/\d+(?:\.\d+)?(?:px|rem|em|%)/.test(v) && /var\(--(?:text|space|radius)-/.test(v);
const allowed = (v: string): boolean => KEYWORD.test(v) || TOKEN.test(v) || calcOfTokens(v);

export function violations(): string[] {
  const bad: string[] = [];
  for (const file of cssFiles('src')) {
    const rel = file.split('\\').join('/');
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    for (const m of text.matchAll(PROP)) {
      const prop = m[1] ?? '';
      if (rel === 'src/ui/design/tokens.css') continue;
      for (const v of parts((m[2] ?? '').replace(/\s*!important/, ''))) {
        if (allowed(v)) continue;
        if (SCALE_EXCEPTIONS.some((e) => e.file === rel && e.prop === prop && e.value === v)) continue;
        const line = text.slice(0, m.index).split('\n').length;
        bad.push(`${rel}:${line} ${prop}: ${v}`);
      }
    }
  }
  return bad;
}

describe('CSS scale guard', () => {
  it('every size, space and radius is a token', () => {
    expect(violations()).toEqual([]);
  });
  it('the exception list is short and every entry says why', () => {
    expect(SCALE_EXCEPTIONS.length).toBeLessThanOrEqual(20);
    for (const e of SCALE_EXCEPTIONS) expect(e.reason.length).toBeGreaterThan(10);
  });
  it('every exception still matches a real declaration', () => {
    const used = SCALE_EXCEPTIONS.map((e) => ({ e, text: readFileSync(e.file, 'utf8') }));
    for (const { e, text } of used) expect(text.includes(e.value)).toBe(true);
  });
});
