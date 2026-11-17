/**
 * Step 8.4m2 (B2, B3): in the dark theme every equation drawing sits on the --paper surface (RDKit's fixed-scale drawings have no background, so the black
 * strokes vanished on the dark card), on the family page, in the full equation and in the inspector's picture; and the inspector's picture is steady:
 * once it is drawn, the placeholder does not come back, and no molecule is cut off at the pane's edge.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { leaveChapters, loadDemo, openApp } from './kit';

test.use({ colorScheme: 'dark', actionTimeout: 60_000 });

/** The drawings in equations that have no ancestor painted with the --paper colour. */
async function bare(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const paper = (() => {
      const probe = document.createElement('i');
      probe.style.background = 'var(--paper)';
      document.body.append(probe);
      const value = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return value;
    })();
    const out: string[] = [];
    for (const img of document.querySelectorAll('[data-equation-term] img, [data-hero-equation] img')) {
      let up: Element | null = img.parentElement;
      let found = false;
      while (up !== null && !found) {
        found = getComputedStyle(up).backgroundColor === paper;
        up = up.parentElement;
      }
      if (!found) out.push(img.getAttribute('alt') ?? 'no alt');
    }
    return out;
  });
}

test('dark: every equation drawing sits on paper (family page, full equation, inspector) and the inspector picture is steady', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1536, height: 960 });
  await openApp(page);
  await loadDemo(page);
  await leaveChapters(page);
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: /^Family page: Alcohols/ })).toBeVisible();
  const card = page.getByRole('article').first();
  await card.getByText('Show full equation').click();
  await expect(card.locator('[data-equation-term] img').first()).toBeVisible();
  expect(await bare(page), 'family page and full equation: every drawing on paper').toEqual([]);
  const title = ((await card.getByRole('heading', { level: 4 }).first().textContent()) ?? '').replace(/\s*(Selected|Review required)\s*$/, '').trim();
  await card.getByRole('button', { name: title }).first().click();
  await expect(page.locator('[data-hero-main] [data-hero-equation] img:visible').first()).toBeVisible();
  // the pane at its widest (the owner's), the picture watched for 3 s
  await page.getByRole('separator', { name: 'Resize inspector' }).focus();
  await page.keyboard.press('End');
  await page.evaluate(() => {
    const w = window as unknown as { __placeholders: number };
    w.__placeholders = 0;
    let drawn = false;
    const tick = (): void => {
      const hero = document.querySelector('[data-hero-main] [data-hero-equation]');
      // only what a person can see: the hidden copy kept for measuring is made again at every swap and may say "Drawing" out of sight
      const seen = (el: Element): boolean => (el as HTMLElement).checkVisibility({ visibilityProperty: true });
      const has = hero !== null && [...hero.querySelectorAll('img')].some(seen);
      const loading = hero !== null && [...hero.querySelectorAll('*')].some((el) => el.children.length === 0 && el.textContent?.includes('Drawing the structure') === true && seen(el));
      if (has) drawn = true;
      else if (drawn && loading) w.__placeholders += 1;
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => (window as unknown as { __placeholders: number }).__placeholders), 'placeholder appearances after the first drawing').toBe(0);
  expect(await bare(page), 'inspector: every drawing on paper').toEqual([]);
  const cut = await page.evaluate(() => {
    const pane = document.querySelector('[data-hero-main]')?.closest('aside')?.getBoundingClientRect();
    if (pane === undefined) return ['no pane'];
    return [...document.querySelectorAll('[data-hero-main] [data-equation-term]')].filter((t) => t.checkVisibility({ visibilityProperty: true }) && t.getBoundingClientRect().right > pane.right + 0.5).map((t) => t.textContent ?? '');
  });
  expect(cut, 'every molecule lies inside the inspector').toEqual([]);
});
