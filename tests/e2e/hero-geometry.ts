/**
 * The geometry of the inspector's reaction hero (step 8.1 review decision 0): it never wraps. Every term after the arrow (the products) is to
 * the right of the arrow (one row) or below it (the vertical layout), never left of it; every term before the arrow is left of or above it; no
 * term sticks out of the hero's box. Measured in the browser, over the hero that is on screen.
 */
import { expect, type Page } from '@playwright/test';

export interface HeroGeometry {
  readonly mode: string;
  readonly terms: number;
  readonly problems: string[];
}

export async function heroGeometry(page: Page): Promise<HeroGeometry> {
  return page.evaluate(() => {
    const visible = [...document.querySelectorAll('[data-hero-equation]')].find((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }) as HTMLElement | undefined;
    if (visible === undefined) return { mode: 'none', terms: 0, problems: ['no hero equation is on screen'] };
    const outer = visible.getBoundingClientRect();
    const scheme = [...visible.querySelectorAll('[data-equation-scheme]')].find((el) => el.closest('[aria-hidden="true"]') === null) as HTMLElement | undefined;
    if (scheme === undefined) return { mode: visible.getAttribute('data-fit') ?? '', terms: 0, problems: [] }; // the one-line text
    const arrow = scheme.querySelector('[data-equation-arrow]') as HTMLElement | null;
    const terms = [...scheme.querySelectorAll('[data-equation-term]')] as HTMLElement[];
    const problems: string[] = [];
    if (arrow === null) return { mode: visible.getAttribute('data-fit') ?? '', terms: terms.length, problems: ['no arrow'] };
    const a = arrow.getBoundingClientRect();
    for (const term of terms) {
      const t = term.getBoundingClientRect();
      const after = (arrow.compareDocumentPosition(term) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const name = (term.textContent ?? '').trim().slice(0, 24);
      if (after && !(t.left >= a.right - 1 || t.top >= a.bottom - 1)) problems.push(`product ${name} is left of or beside the arrow, not right of or below it`);
      if (!after && !(t.right <= a.left + 1 || t.bottom <= a.top + 1)) problems.push(`reactant ${name} is right of or under the arrow`);
      if (t.left < outer.left - 1 || t.right > outer.right + 1) problems.push(`term ${name} overflows the hero (${Math.round(t.left)}..${Math.round(t.right)} in ${Math.round(outer.left)}..${Math.round(outer.right)})`);
    }
    return { mode: visible.getAttribute('data-fit') ?? '', terms: terms.length, problems };
  });
}

export async function expectHeroNeverWraps(page: Page, where: string): Promise<HeroGeometry> {
  // the hero is measured after it is shown (a sheet that has just been dragged open): wait until it has its terms
  await expect.poll(async () => (await heroGeometry(page)).terms, { message: `the hero equation at ${where} is drawn`, timeout: 15_000 }).toBeGreaterThan(0);
  // the scale is applied a frame or two after the images arrive: it must settle, and then it must be right
  await expect.poll(async () => (await heroGeometry(page)).problems, { message: `the hero equation at ${where} settles without a wrap or an overflow`, timeout: 10_000 }).toEqual([]);
  const geometry = await heroGeometry(page);
  expect(geometry.problems, `the hero equation at ${where} (${geometry.mode}, ${geometry.terms} terms)`).toEqual([]);
  expect(geometry.terms, `the hero equation at ${where} has its terms`).toBeGreaterThan(0);
  return geometry;
}
