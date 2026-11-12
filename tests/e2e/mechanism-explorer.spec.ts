/**
 * The Mechanisms view (step 7.4 E), every engine, over the demo imported as the visitor's own data (the same records on the Studio build and on
 * the live Study site): "Mechanisms" is live in the mode rail; the list has the three mechanisms with classes in words and "n reactions · n steps";
 * "Find by name" finds one; a page with two pathways has a section per variant with numbered steps (kinds in words, role words, the slow-step and
 * reversible marks, the rate law, the species drawn); one pathway has no variant heading; no curved-arrow text; Alt+Enter on a palette hit opens the
 * page; the open page survives a reload; axe on each state; zero CSP violations. Screenshots: mechanism-list, mechanism-page, mechanism-variants
 * (all -1280x800.png).
 */
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  axeProblems,
  expectClean,
  leaveChapters,
  watch,
  examWord,
  chooseExam,
} from "./kit";
import { shotsDir } from "./editor-kit";
import { changedDemo, importOwn } from "./own-data-kit";

test.use({ actionTimeout: 60_000 });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Mechanisms', exact: true });
const rows = (page: Page) => view(page).getByRole('list', { name: 'Mechanisms' }).locator('[data-mechanism-id]');

async function openMechanisms(page: Page): Promise<void> {
  await leaveChapters(page);
  await rail(page).getByRole('button', { name: 'Mechanisms' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Mechanisms' })).toBeVisible();
}

test('the list, the find box, a page with two pathways (steps, marks, drawings) and one with a single pathway', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined));

  await expect(rail(page).getByRole('button', { name: /^Mechanisms/ })).not.toContainText('Phase 7');
  await openMechanisms(page);

  await expect(rows(page)).toHaveCount(3);
  await expect(view(page).getByText('3 mechanisms')).toBeVisible();
  await expect(rows(page).filter({ hasText: 'Aldol addition of ethanal' })).toContainText('1 reaction · 7 steps');
  await expect(rows(page).filter({ hasText: 'SN2' })).toContainText('1 reaction · 1 step');
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/mechanism-list-1280x800.png` });

  await view(page).getByLabel('Find by name').fill('e2');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('E2 elimination');
  await view(page).getByRole('button', { name: 'Clear all filters' }).click();

  // two pathways: a section each; numbered steps
  await rows(page).filter({ hasText: 'Aldol addition of ethanal' }).getByRole('button', { name: 'Aldol addition of ethanal' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Aldol addition of ethanal' })).toBeVisible();
  const sections = view(page).locator('[data-variant-id]');
  await expect(sections).toHaveCount(2);
  await expect(view(page).getByRole('heading', { level: 3 }).first()).toBeVisible();
  const steps = view(page).locator('[data-step]');
  await expect(steps.first()).toContainText('Step 1');
  expect(await steps.count()).toBe(7);
  await expect(view(page).locator('[data-variant-id] img').first()).toBeVisible({ timeout: 60_000 }); // a drawn species
  const text = (await view(page).textContent()) ?? '';
  expect(text).not.toMatch(/curved arrow|arrow pushing|coming later|Phase 8/i);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/mechanism-variants-1280x800.png` });

  // one pathway: no variant heading; the rate law and the slow-step mark
  await view(page).getByRole('button', { name: 'All mechanisms' }).click();
  await rows(page).filter({ hasText: 'SN2' }).getByRole('button', { name: /SN2/ }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: /SN2/ })).toBeVisible();
  await expect(view(page).getByRole('heading', { level: 3, name: 'Concerted backside attack' })).toHaveCount(0);
  await expect(view(page).locator('[data-step]').first()).toContainText('slow step');
  await expect(view(page).locator('[data-rate-law]')).toBeVisible();
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/mechanism-page-1280x800.png` });
  await expectClean(seen);
});

test('Alt+Enter on a palette hit opens the page; the exam scope offers "Only"; the open page comes back after a reload', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined));
  await openMechanisms(page);

  await chooseExam(page, examWord("JEE Main, provisional, not verified"));
  // "Only <exam>" is one switch in the top bar now (step 8.3b, B2): the per-view box is gone
  await expect(view(page).getByLabel(/^Only /)).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: "Only JEE Main" }),
  ).toBeChecked();
  await page.getByRole("radio", { name: "Everything" }).check();
  await page.getByRole("radio", { name: "Only JEE Main" }).check();
  await chooseExam(page, "All exams");

  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: /Search/ });
  await palette.getByRole('combobox').fill('E2 elimination');
  const hit = palette.getByRole('option', { name: /E2 elimination of a haloalkane/ }).first();
  await expect(hit).toBeVisible({ timeout: 60_000 });
  await hit.hover();
  await expect(palette.getByText('Alt+Enter: open its page')).toBeVisible();
  await page.keyboard.press('Alt+Enter');
  await expect(view(page).getByRole('heading', { level: 2, name: 'E2 elimination of a haloalkane' })).toBeVisible({ timeout: 60_000 });

  await page.waitForTimeout(1000); // the saved state is written after a short pause (SAVE_DEBOUNCE_MS)
  await page.reload();
  await leaveChapters(page).catch(() => undefined);
  await rail(page).getByRole('button', { name: 'Mechanisms' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'E2 elimination of a haloalkane' })).toBeVisible({ timeout: 60_000 });
  await expectClean(seen);
});
