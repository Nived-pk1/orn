/**
 * The design tokens (step 5.2, UI_ARCHITECTURE §3 and §11): the contrast of every text / background pair is computed from
 * `tokens.css` itself (WCAG 2.2 relative luminance) and meets AA (4.5:1 for text, 3:1 for the focus ring and control borders); the
 * focus ring is 2 px; hit targets are 24 px and 44 px on touch; reduced motion zeroes the durations.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANCHOR_TONES } from '@/core/schema';

const CSS = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');

/** `--name: #rrggbb;` declarations of the token file. */
function colours(): Map<string, string> {
  const found = new Map<string, string>();
  for (const match of CSS.matchAll(/--(color-[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) found.set(match[1] as string, match[2] as string);
  return found;
}

function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TOKENS = colours();
const token = (name: string): string => {
  const value = TOKENS.get(name);
  if (value === undefined) throw new Error(`token ${name} is not a #rrggbb colour in tokens.css`);
  return value;
};

/** Text colours on the backgrounds they are used on (4.5:1). `on-accent` is the text on an accent fill (primary buttons). */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['color-ink', 'color-paper'],
  ['color-ink', 'color-surface'],
  ['color-ink-2', 'color-paper'],
  ['color-ink-2', 'color-surface'],
  ['color-accent', 'color-paper'],
  ['color-accent', 'color-surface'],
  ['color-warning', 'color-paper'],
  ['color-warning', 'color-surface'],
  ['color-error', 'color-paper'],
  ['color-error', 'color-surface'],
  ['color-review', 'color-paper'],
  ['color-review', 'color-surface'],
  ['color-paper', 'color-accent'],
];

/** Non-text contrast (3:1): the focus ring against both backgrounds, control borders (ink-2) against both. */
const NON_TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ['color-accent', 'color-paper'],
  ['color-accent', 'color-surface'],
  ['color-ink-2', 'color-paper'],
  ['color-ink-2', 'color-surface'],
];

describe('colour tokens', () => {
  it('has the eight tokens of UI_ARCHITECTURE §3 with their stated values', () => {
    expect(token('color-paper')).toBe('#fcfcfb');
    expect(token('color-ink')).toBe('#16191d');
    expect(token('color-ink-2')).toBe('#5a626b');
    expect(token('color-rule')).toBe('#d9dde1');
    expect(token('color-accent')).toBe('#2b4fd8');
    expect(token('color-warning')).toBe('#b45309');
    expect(token('color-error')).toBe('#b42318');
    expect(token('color-review')).toBe('#7a3fb0');
  });

  it.each(TEXT_PAIRS)('text %s on %s meets 4.5:1 (WCAG 2.2 AA)', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('non-text %s on %s meets 3:1', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(3);
  });

  it('the contrast function is right on the two known extremes', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('every pair above uses tokens that exist (a renamed token cannot silently drop out of the test)', () => {
    for (const [a, b] of [...TEXT_PAIRS, ...NON_TEXT_PAIRS]) {
      expect(TOKENS.has(a)).toBe(true);
      expect(TOKENS.has(b)).toBe(true);
    }
  });
});

describe('focus ring, hit targets and motion tokens', () => {
  it('the focus ring is 2 px in the accent colour', () => {
    expect(CSS).toMatch(/--focus-ring-width:\s*2px;/);
    expect(CSS).toMatch(/--focus-ring-color:\s*var\(--color-accent\);/);
  });

  it('hit targets are 24 px, 44 px for a coarse pointer', () => {
    expect(CSS).toMatch(/--hit-min:\s*24px;/);
    expect(CSS).toMatch(/@media \(pointer: coarse\)\s*\{\s*:root\s*\{\s*--hit-min:\s*44px;/);
  });

  it('prefers-reduced-motion zeroes the motion durations', () => {
    expect(CSS).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--motion-fast:\s*0ms;\s*--motion-slow:\s*0ms;/);
  });

  it('the type scale is 12/13/14/16/20/24 px', () => {
    const sizes = [...CSS.matchAll(/--text-(\d+):\s*([\d.]+)rem;/g)].map((m) => [Number(m[1]), Number(m[2]) * 16]);
    expect(sizes).toEqual([[12, 12], [13, 13], [14, 14], [16, 16], [20, 20], [24, 24]]);
  });
});

describe('rounded corners (ADR-037, 2026-10-09)', () => {
  it('cards and panels are 8 px, controls 6 px', () => {
    expect(CSS).toMatch(/--radius-card:\s*8px;/);
    expect(CSS).toMatch(/--radius-control:\s*6px;/);
  });

  it('every radius a stylesheet uses is a defined token, and the old 4 px token is gone', () => {
    expect(CSS).not.toMatch(/--radius-2:/);
    const defined = new Set([...CSS.matchAll(/--(radius-[a-z0-9-]+):/g)].map((m) => m[1]));
    const roots = ['../primitives', '../../features', '../../app'];
    const used = new Set<string>();
    const visit = (dir: URL): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
        if (entry.isDirectory()) visit(child);
        else if (entry.name.endsWith('.css')) for (const m of readFileSync(child, 'utf8').matchAll(/var\(--(radius-[a-z0-9-]+)\)/g)) used.add(m[1] as string);
      }
    };
    for (const root of roots) visit(new URL(root + '/', import.meta.url));
    expect(used.size).toBeGreaterThan(0);
    for (const name of used) expect(defined.has(name), name).toBe(true);
  });
});


describe('family tones (ADR-037, step 5.5c): tint, border and ink for each tone', () => {
  const TONES = ['blue', 'green', 'amber', 'violet', 'teal', 'rose', 'slate'] as const;
  const part = (tone: string, what: 'tint' | 'border' | 'ink'): string => token(`color-tone-${tone}-${what}`);

  it('the tones are exactly the schema\'s (a tone the schema allows has colours, and no colour is left over)', () => {
    expect([...ANCHOR_TONES]).toEqual([...TONES]);
    const defined = [...TOKENS.keys()].filter((name) => name.startsWith('color-tone-')).sort();
    expect(defined).toEqual(TONES.flatMap((tone) => (['tint', 'border', 'ink'] as const).map((what) => `color-tone-${tone}-${what}`)).sort());
  });

  it.each(TONES)('%s: the ink and the ordinary text colour meet 4.5:1 on the tint, and the ink on the page and the surface', (tone) => {
    const tint = part(tone, 'tint');
    expect(contrast(part(tone, 'ink'), tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-ink'), tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-ink-2'), tint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(part(tone, 'ink'), token('color-paper'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(part(tone, 'ink'), token('color-surface'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TONES)('%s: the left rule (ink) is a shape against the tint and the page (3:1), and the border is darker than the tint', (tone) => {
    expect(contrast(part(tone, 'ink'), part(tone, 'tint'))).toBeGreaterThanOrEqual(3);
    expect(contrast(part(tone, 'ink'), token('color-paper'))).toBeGreaterThanOrEqual(3);
    expect(luminance(part(tone, 'border'))).toBeLessThan(luminance(part(tone, 'tint')));
  });

  it('no two tones share a tint, a border or an ink', () => {
    for (const what of ['tint', 'border', 'ink'] as const) expect(new Set(TONES.map((tone) => part(tone, what))).size).toBe(TONES.length);
  });
});
