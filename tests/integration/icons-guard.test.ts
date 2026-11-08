/**
 * Icon guard (step 8.4d, Part B): every icon the code names exists as a vendored file under public/icons, every vendored icon is used
 * by the code, the licence text sits beside them, the favicon files exist and are linked, and DEPENDENCIES.md records the source.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ICONS = 'public/icons';
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name).split(sep).join('/')]));
const source = files('src').filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const ICON_SOURCE = 'src/ui/primitives/icons.tsx';
const declared = (): string[] => {
  const text = readFileSync(ICON_SOURCE, 'utf8');
  const list = /ICON_NAMES\s*=\s*\[([\s\S]*?)\]\s*as const/.exec(text)?.[1] ?? '';
  return [...list.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1] as string);
};
const vendored = (): string[] => readdirSync(ICONS).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

describe('icons', () => {
  it('the declared names are exactly the vendored files', () => {
    expect(declared().length).toBeGreaterThan(20);
    expect([...declared()].sort()).toEqual(vendored());
  });

  it('every vendored icon is named by code other than the list itself', () => {
    const others = source.filter((f) => f !== ICON_SOURCE).map((f) => readFileSync(f, 'utf8')).join('\n');
    const unused = vendored().filter((name) => !new RegExp(`['"\`]${name}['"\`]`).test(others));
    expect(unused).toEqual([]);
  });

  it('is single-colour, stroke 1.75, no script, no external reference', () => {
    for (const name of vendored()) {
      const text = readFileSync(join(ICONS, `${name}.svg`), 'utf8');
      expect(text, name).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
      expect(text, name).toContain('stroke-width="1.75"');
      expect(text, name).not.toMatch(/<script|href=|url\(|<style|on[a-z]+=/i);
    }
  });

  it('keeps the licence text beside the icons', () => {
    const licence = readFileSync(join(ICONS, 'LICENSE.txt'), 'utf8');
    expect(licence).toMatch(/ISC License/);
    expect(licence).toMatch(/Lucide/);
  });

  it('has the favicon files from the mark and links them', () => {
    expect(existsSync('public/favicon.svg')).toBe(true);
    expect(existsSync('public/favicon-32.png')).toBe(true);
    const html = readFileSync('index.html', 'utf8');
    expect(html).toMatch(/rel="icon"[^>]*favicon\.svg/);
    expect(html).toMatch(/rel="icon"[^>]*favicon-32\.png/);
  });

  it('DEPENDENCIES.md and the About credits record the icon source', () => {
    expect(readFileSync('docs/DEPENDENCIES.md', 'utf8')).toMatch(/Lucide/);
    const about = readFileSync('src/app/window/about-preview.tsx', 'utf8');
    expect(about).toMatch(/Lucide/);
  });
});
