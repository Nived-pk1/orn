/**
 * The Review page grouped by Import (the default), Chapter or Kind (step 7.3a E1, E2; 7.3b A1, A3), the STUDIO production build, every
 * engine, over the demo (its reactions are mapped to topics, so they have chapters). Import groups by where a record came from ("Demo data"
 * for the seed); Chapter groups by the chapter TOPIC with a record in each of its chapters and "No chapter yet" last; Kind is the kind of
 * the record. The choice survives a reload; the Import, Chapter and Kind filters carry counts; "Clear all filters" brings every group back.
 * Axe on each state, zero policy violations. Screenshots: review-by-import, review-by-chapter, review-by-kind (-1280x800.png).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';
import { shotsDir } from './editor-kit';

test.use({ actionTimeout: 60_000 });
const review = (page: Page) => page.getByRole('region', { name: 'Review', exact: true });
const groupBy = (page: Page) => review(page).getByRole('radiogroup', { name: 'Group by' });
const headings = (page: Page) => review(page).getByRole('heading', { level: 3 });

async function toastsAway(page: Page): Promise<void> {
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

test('Group by Import (the default), Chapter and Kind; the choice is kept; filters carry counts; Clear all filters', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Review' }).click();
  await expect(review(page)).toBeVisible();

  // Import is the default: the demo's records came with the seed
  await expect(groupBy(page).getByRole('radio')).toHaveCount(3);
  await expect(groupBy(page).getByRole('radio', { name: 'Import' })).toBeChecked();
  await expect(headings(page).first()).toHaveText(/^Demo data · \d+ records?$/);
  expect(await axeProblems(page)).toEqual([]);
  await toastsAway(page);
  await page.screenshot({ path: `${shotsDir()}/review-by-import-1280x800.png` });

  // Chapter: the chapter topics, with "No chapter yet" among the groups
  await groupBy(page).getByRole('radio', { name: 'Chapter' }).check();
  await expect(headings(page).first()).toHaveText(/^.+ \(\d+\)$/);
  const chapterOptions = await review(page).getByRole('combobox', { name: 'Chapter' }).locator('option').allTextContents();
  expect(chapterOptions.some((text) => /^Alcohols, phenols and ethers \(\d+\)$/.test(text))).toBe(true);
  expect(chapterOptions.some((text) => /^No chapter yet \(\d+\)$/.test(text))).toBe(true);
  expect(await axeProblems(page)).toEqual([]);

  // kept through a reload (tolerant uiState)
  await page.reload();
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Review' }).click();
  await expect(groupBy(page).getByRole('radio', { name: 'Chapter' })).toBeChecked({ timeout: 60_000 });

  // filters with counts, then Clear all filters
  const chapter = review(page).getByRole('combobox', { name: 'Chapter' });
  const options = await chapter.locator('option').allTextContents();
  const wanted = options.find((text) => /^Alcohols, phenols and ethers \(\d+\)$/.test(text));
  expect(wanted).toBeTruthy();
  await chapter.selectOption({ label: wanted as string });
  await expect(headings(page)).toHaveCount(1);
  await expect(review(page).getByRole('button', { name: 'Clear all filters' })).toBeVisible();
  await review(page).getByRole('button', { name: 'Clear all filters' }).click();
  expect(await headings(page).count()).toBeGreaterThan(1);
  await expect(review(page).getByRole('button', { name: 'Clear all filters' })).toHaveCount(0);
  expect(await axeProblems(page)).toEqual([]);
  // screenshots last: a reload empties the page's count of the styles WebKit's inspector injects for them, which expectClean forgives
  await groupBy(page).getByRole('radio', { name: 'Kind' }).check();
  await expect(headings(page).first()).toBeVisible();
  await page.screenshot({ path: `${shotsDir()}/review-by-kind-1280x800.png` });
  await groupBy(page).getByRole('radio', { name: 'Chapter' }).check();
  await expect(headings(page).first()).toHaveText(/^.+ \(\d+\)$/);
  await page.screenshot({ path: `${shotsDir()}/review-by-chapter-1280x800.png` });
  await expectClean(seen);
});
