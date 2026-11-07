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

export async function heroGeometry(page: Page, root = 'body'): Promise<HeroGeometry & { readonly scale: number }> {
  return page.evaluate((rootSelector) => {
    const scope = document.querySelector(rootSelector) ?? document.body;
    const visible = [...scope.querySelectorAll('[data-hero-equation]')].find((el) => {
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    }) as HTMLElement | undefined;
    if (visible === undefined) return { mode: 'none', terms: 0, scale: 0, problems: ['no hero equation is on screen'] };
    const mode = visible.getAttribute('data-fit') ?? '';
    const outer = visible.getBoundingClientRect();
    const scheme = [...visible.querySelectorAll('[data-equation-scheme]')].find((el) => el.closest('[aria-hidden="true"]') === null) as HTMLElement | undefined;
    if (scheme === undefined) {
      // the one-line text: visible, on ONE line, not clipped
      const card = visible.querySelector('[data-hero-text]') as HTMLElement | null;
      if (card === null) return { mode, terms: 0, scale: 0, problems: ['text mode without its text card'] };
      const style = getComputedStyle(card);
      const rect = card.getBoundingClientRect();
      const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2;
      const inner = rect.height - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom);
      const problems: string[] = [];
      if (rect.width === 0 || rect.height === 0) problems.push('the text card is not visible');
      if (inner > lineHeight * 1.6) problems.push(`the text is not on one line (${Math.round(inner)} px high, line ${Math.round(lineHeight)} px)`);
      if (card.scrollWidth > card.clientWidth + 1) problems.push(`the text is clipped (${card.scrollWidth} > ${card.clientWidth})`);
      return { mode, terms: 0, scale: 0, problems };
    }
    const scale = Math.round((scheme.getBoundingClientRect().width / (scheme.offsetWidth || 1)) * 100) / 100;
    const arrow = scheme.querySelector('[data-equation-arrow]') as HTMLElement | null;
    const terms = [...scheme.querySelectorAll('[data-equation-term]')] as HTMLElement[];
    const problems: string[] = [];
    if (arrow === null) return { mode, terms: terms.length, scale, problems: ['no arrow'] };
    if (terms.length === 0) problems.push('no terms are drawn');
    const a = arrow.getBoundingClientRect();
    for (const term of terms) {
      const t = term.getBoundingClientRect();
      const after = (arrow.compareDocumentPosition(term) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      const name = (term.textContent ?? '').trim().slice(0, 24);
      if (after && !(t.left >= a.right - 1 || t.top >= a.bottom - 1)) problems.push(`product ${name} is left of or beside the arrow, not right of or below it`);
      if (!after && !(t.right <= a.left + 1 || t.bottom <= a.top + 1)) problems.push(`reactant ${name} is right of or under the arrow`);
      if (t.left < outer.left - 1 || t.right > outer.right + 1) problems.push(`term ${name} overflows the hero (${Math.round(t.left)}..${Math.round(t.right)} in ${Math.round(outer.left)}..${Math.round(outer.right)})`);
    }
    return { mode, terms: terms.length, scale, problems };
  }, root);
}

/** Wait until the hero has SETTLED: the same mode (and, drawn, the same scale to 0.01) on 3 reads at least 250 ms apart, within 15 s. */
async function settledHero(page: Page, root: string): Promise<HeroGeometry & { readonly scale: number }> {
  const deadline = Date.now() + 15_000;
  let last = await heroGeometry(page, root);
  let same = 1;
  while (same < 3) {
    if (Date.now() > deadline) throw new Error(`the hero did not settle in 15 s (last: ${last.mode}, scale ${last.scale})`);
    await page.waitForTimeout(250);
    const now = await heroGeometry(page, root);
    same = now.mode === last.mode && Math.abs(now.scale - last.scale) <= 0.01 && now.mode !== 'none' ? same + 1 : 1;
    last = now;
  }
  return last;
}

/** The settled hero, in `root` (the phone sheet or the desktop pane): drawn (row or stacked) with its terms and no problems, or the one-line text, whole. */
export async function expectHeroNeverWraps(page: Page, where: string, root = 'body'): Promise<HeroGeometry> {
  const geometry = await settledHero(page, root);
  console.log(`hero at ${where}: ${geometry.mode} (${geometry.terms} terms, scale ${geometry.scale})`);
  expect(geometry.problems, `the hero equation at ${where} (${geometry.mode}, ${geometry.terms} terms)`).toEqual([]);
  if (geometry.mode !== 'text') expect(geometry.terms, `the hero equation at ${where} has its terms`).toBeGreaterThan(0);
  return geometry;
}
