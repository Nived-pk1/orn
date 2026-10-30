/**
 * The Review page grouped by Chapter or by Kind (step 7.3a E1, E2), the STUDIO production build, every engine, over the demo (its reactions
 * are mapped to topics, so they have chapters). Kind is the default; Chapter groups by "<exam version> › <unit>" with a record in each of its
 * chapters and "No chapter yet" last; the choice survives a reload; the Chapter and Kind filters carry counts; "Clear all filters" brings
 * every group back. There is no grouping by import (a record carries no import id: REVIEW REQUIRED in docs/PROGRESS.md).
 * Axe on each state, zero policy violations. Screenshots: review-by-kind-1280x800.png, review-by-chapter-1280x800.png.
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

test('Group by Kind (the default) and Chapter; the choice is kept; filters carry counts; Clear all filters', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Review' }).click();
  await expect(review(page)).toBeVisible();

  // Kind, today's grouping, is the default; no Import choice
  await expect(groupBy(page).getByRole('radio')).toHaveCount(2);
  await expect(groupBy(page).getByRole('radio', { name: 'Kind' })).toBeChecked();
  await expect(headings(page).first()).toHaveText(/\(\d+\)$/);
  expect(await axeProblems(page)).toEqual([]);
  await toastsAway(page);
  await page.screenshot({ path: `${shotsDir()}/review-by-kind-1280x800.png` });

  // Chapter
  await groupBy(page).getByRole('radio', { name: 'Chapter' }).check();
  // the list is virtual, so the first groups are what is drawn: chapters, "<exam version> › <unit>", each with its count
  await expect(headings(page).first()).toHaveText(/^JEE (Advanced|Main) 2026 \(provisional\) › .+ \(\d+\)$/);
  // both exam versions have the unit, and the filter lists each with its count
  const chapterOptions = await review(page).getByRole('combobox', { name: 'Chapter' }).locator('option').allTextContents();
  expect(chapterOptions.filter((text) => /^JEE (Advanced|Main) 2026 \(provisional\) › Alcohols, phenols and ethers \(\d+\)$/.test(text))).toHaveLength(2);
  expect(chapterOptions.some((text) => /^No chapter yet \(\d+\)$/.test(text))).toBe(true);
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/review-by-chapter-1280x800.png` });

  // kept through a reload (tolerant uiState)
  await page.reload();
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Review' }).click();
  await expect(groupBy(page).getByRole('radio', { name: 'Chapter' })).toBeChecked({ timeout: 60_000 });

  // filters with counts, then Clear all filters
  const chapter = review(page).getByRole('combobox', { name: 'Chapter' });
  const options = await chapter.locator('option').allTextContents();
  const wanted = options.find((text) => /^JEE Advanced 2026 \(provisional\) › Alcohols, phenols and ethers \(\d+\)$/.test(text));
  expect(wanted).toBeTruthy();
  await chapter.selectOption({ label: wanted as string });
  await expect(headings(page)).toHaveCount(1);
  await expect(review(page).getByRole('button', { name: 'Clear all filters' })).toBeVisible();
  await review(page).getByRole('button', { name: 'Clear all filters' }).click();
  expect(await headings(page).count()).toBeGreaterThan(1);
  await expect(review(page).getByRole('button', { name: 'Clear all filters' })).toHaveCount(0);
  expect(await axeProblems(page)).toEqual([]);
  await expectClean(seen);
});
