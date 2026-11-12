/**
 * The Named reactions view (step 7.4 D), every engine, over the demo imported as the visitor's own data (the same records on the Studio build and
 * on the live Study site): "Named reactions" is live in the mode rail; the list has every named reaction with its counts in words; "Find by name"
 * finds a record by an alias; the exam scope offers "Only <exam version>"; a page has its summary, the reactions as their own cards, a parent its
 * kinds, a mechanism line that opens the Mechanisms page; Alt+Enter on a palette hit opens the page; the open page survives a reload; axe on each
 * state; zero CSP violations. Screenshots: named-list, named-page, named-page-parent (all -1280x800.png).
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
const view = (page: Page) => page.getByRole('region', { name: 'Named reactions', exact: true });
const rows = (page: Page) => view(page).getByRole('list', { name: 'Named reactions' }).locator('[data-named-id]');

async function openNamed(page: Page): Promise<void> {
  await leaveChapters(page);
  await rail(page).getByRole('button', { name: 'Named reactions' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Named reactions' })).toBeVisible();
}

test('the list, the find box (an alias), the pages (reactions, kinds, mechanism) and the palette', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined));

  await expect(rail(page).getByRole('button', { name: /^Named reactions/ })).not.toContainText('Phase 7');
  await openNamed(page);

  // the list
  await expect(rows(page).first()).toBeVisible();
  const total = await rows(page).count();
  expect(total).toBeGreaterThanOrEqual(12);
  await expect(view(page).getByText(`${total} named reactions`)).toBeVisible();
  const aldol = rows(page).filter({ hasText: 'Aldol reaction' });
  await expect(aldol).toContainText('1 reaction · has a mechanism');
  await expect(aldol).toContainText('also called Aldol addition, Aldol');
  await expect(rows(page).filter({ hasText: 'Friedel–Crafts acylation' })).toContainText('Part of Friedel–Crafts reaction');
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/named-list-1280x800.png` });

  // find by alias
  await view(page).getByLabel('Find by name').fill('Peroxide effect');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Kharasch effect');
  await view(page).getByRole('button', { name: 'Clear all filters' }).click();
  await expect(rows(page)).toHaveCount(total);

  // a page with reactions and a mechanism
  await rows(page).filter({ hasText: 'Aldol reaction' }).getByRole('button', { name: 'Aldol reaction' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Aldol reaction' })).toBeVisible();
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  await expect(view(page).getByRole('button', { name: 'Show these reactions in Reactions' })).toBeVisible();
  // 7.6 A1: Studio says "No chapter yet"; Study leaves the line out when the record has no chapter (the demo's Aldol has none)
  await expect(view(page).locator('[data-in-chapters]')).toHaveCount((await view(page).getByRole('button', { name: 'Edit', exact: true }).count()) > 0 ? 1 : 0);
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/named-page-1280x800.png` });

  // the mechanism line opens the Mechanisms page
  await view(page).getByRole('region', { name: 'Mechanisms' }).getByRole('button').first().click();
  const mechanisms = page.getByRole('region', { name: 'Mechanisms', exact: true });
  await expect(mechanisms.getByRole('heading', { level: 2, name: 'Aldol addition of ethanal' })).toBeVisible();

  // a parent has its kinds
  await rail(page).getByRole('button', { name: 'Named reactions' }).click();
  await view(page).getByRole('button', { name: 'All named reactions' }).click();
  await rows(page).filter({ hasText: 'Friedel–Crafts reaction' }).getByRole('button', { name: 'Friedel–Crafts reaction' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Friedel–Crafts reaction' })).toBeVisible();
  await expect(view(page).locator('[data-link-line="Kinds"]')).toContainText('Friedel–Crafts acylation');
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/named-page-parent-1280x800.png` });
  await view(page).locator('[data-link-line="Kinds"]').getByRole('button', { name: 'Friedel–Crafts acylation' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Friedel–Crafts acylation' })).toBeVisible();
  await expect(view(page).locator('[data-link-line="Part of"]')).toContainText('Friedel–Crafts reaction');

  // "Show these reactions in Reactions"
  await view(page).getByRole('button', { name: 'Show these reactions in Reactions' }).click();
  const reactions = page.getByRole('region', { name: 'Reactions', exact: true });
  await expect(reactions.getByRole('list', { name: 'Chosen filters' }).getByRole('listitem').first()).toContainText('Named reaction: Friedel–Crafts acylation');
  await expectClean(seen);
});

test('Alt+Enter on a palette hit opens the page; the exam scope offers "Only"; the open page comes back after a reload', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined));
  await openNamed(page);

  await chooseExam(page, examWord("JEE Main, provisional, not verified"));
  // "Only <exam>" is the top bar's one switch (step 8.3b, B2): on by default with an exam, no box in the view
  await expect(view(page).getByLabel(/^Only /)).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Only JEE Main' })).toBeChecked();
  expect(await axeProblems(page)).toEqual([]);
  await page.getByRole("radio", { name: "Everything" }).check();
  await chooseExam(page, "All exams");
  await expect(page.getByRole("radiogroup", { name: "Show" })).toHaveCount(0);

  // the palette: Alt+Enter on the Cannizzaro named-reaction hit opens its page
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: /Search/ });
  await palette.getByRole('combobox').fill('Cannizzaro reaction');
  const hit = palette.getByRole('option', { name: /Cannizzaro reaction/ }).first();
  await expect(hit).toBeVisible({ timeout: 60_000 });
  await hit.hover();
  await expect(palette.getByText('Alt+Enter: open its page')).toBeVisible();
  await page.keyboard.press('Alt+Enter');
  await expect(view(page).getByRole('heading', { level: 2, name: 'Cannizzaro reaction' })).toBeVisible({ timeout: 60_000 });

  // the open page is saved: a reload opens the same page
  await page.waitForTimeout(1000); // the saved state is written after a short pause (SAVE_DEBOUNCE_MS)
  await page.reload();
  await leaveChapters(page).catch(() => undefined);
  await rail(page).getByRole('button', { name: 'Named reactions' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Cannizzaro reaction' })).toBeVisible({ timeout: 60_000 });
  await expectClean(seen);
});
