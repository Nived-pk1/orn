/**
 * Phase 7 Definition of Done gaps (step 7.7 Part C, docs/reviews/phase-7-dod.md): the truncation notices of Chapters, Named reactions,
 * Mechanisms, Reagents and Syllabus (the Precursors notice cannot be reached from the screen with test-size data: see the audit); "Only <exam>" narrowing in Named reactions and Mechanisms; the Syllabus default version from the exam
 * scope; the palette and inspector entry points. Own data (dod-kit.ts); the demo chemistry is never edited. Studio build.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, leaveChapters, watch, examWord } from './kit';
import { palette, shotsDir } from './editor-kit';
import { changedDemo, importOwn } from './own-data-kit';
import { longChapterDemo, longListsDemo } from './dod-kit';

test.use({ actionTimeout: 60_000 });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

async function openMode(page: Page, name: string): Promise<void> {
  await leaveChapters(page).catch(() => undefined);
  await rail(page).getByRole('button', { name, exact: true }).click();
  await expect(region(page, name).getByRole('heading', { level: 2, name })).toBeVisible();
}

test('Named reactions, Mechanisms and Reagents: a list of more than 30 is cut at 30 and says so; "Only <exam>" narrows with its count', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, longListsDemo());
  const scope = page.getByRole('combobox', { name: /^Exam$/ });
  for (const [mode, noun, entry] of [['Named reactions', 'named reactions', '[data-named-id]'], ['Mechanisms', 'mechanisms', '[data-mechanism-id]']] as const) {
    await openMode(page, mode);
    const view = region(page, mode);
    const list = view.getByRole('list', { name: mode });
    expect(await list.locator(entry).count()).toBe(30);
    await expect(view.getByText(new RegExp(`^Showing 30 of \\d+ ${noun}$`))).toBeVisible();
    await view.getByRole('button', { name: 'Show 30 more' }).click();
    expect(await list.locator(entry).count()).toBeGreaterThan(30);
    // "Only <exam version>": the clones have no reaction, so they are hidden and the count line says how many are left
    await scope.selectOption({ label: examWord('JEE Main, provisional, not verified') });
    await expect(view.getByText(new RegExp(`^\\d+ of \\d+ ${noun}$`))).toBeVisible();
    expect(await list.locator(entry).count()).toBeLessThan(30);
    expect(await axeProblems(page)).toEqual([]);
    await page.getByRole('radio', { name: 'Everything' }).check(); // the top bar's switch (step 8.3b, B2)
    await scope.selectOption({ value: '' });
  }
  await openMode(page, 'Reagents');
  const reagents = region(page, 'Reagents');
  await expect(reagents.getByText(/^Showing 30 of \d+ reagents$/)).toBeVisible();
  await reagents.getByRole('button', { name: 'Show 30 more' }).click();
  await expect(reagents.getByText(/^Showing 30 of/)).toHaveCount(0);
  expect(await axeProblems(page)).toEqual([]);
  await expectClean(seen);
});

test('Chapters: a group of 35 concepts is cut at 30; Syllabus: a unit of 65 topics is cut at 60 and the exam scope picks the version', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, longChapterDemo());
  await leaveChapters(page).catch(() => undefined);
  await rail(page).getByRole('button', { name: 'Chapters' }).click();
  const chapters = region(page, 'Chapters');
  await chapters.getByRole('list', { name: 'Chapters' }).getByRole('button', { name: 'Hydrocarbons' }).click();
  await expect(chapters.getByRole('heading', { level: 2, name: 'Hydrocarbons' })).toBeVisible();
  await expect(chapters.getByText(/^Showing 30 of \d+ concepts$/)).toBeVisible();
  await chapters.getByRole('button', { name: 'Show 30 more' }).click();
  await expect(chapters.getByText(/^Showing 30 of \d+ concepts$/)).toHaveCount(0);
  expect(await axeProblems(page)).toEqual([]);

  // the exam scope picks the version the Syllabus opens with; choosing a version there leaves the scope alone
  const scope = page.getByRole('combobox', { name: /^Exam$/ });
  await scope.selectOption({ label: examWord('JEE Advanced, provisional, not verified') });
  await rail(page).getByRole('button', { name: 'Syllabus' }).click();
  const syllabus = region(page, 'Syllabus');
  await expect(syllabus.getByLabel('Exam version')).toHaveValue('exv_jee-advanced-2026');
  await syllabus.getByLabel('Exam version').selectOption({ value: 'exv_jee-main-2026' });
  await expect(scope.locator('option:checked')).toHaveText('JEE Advanced');
  const unit = syllabus.locator('[data-unit-id="unt_zz-long"]');
  await expect(unit.getByText(/^Showing 60 of 65 topics$/)).toBeVisible();
  await unit.getByRole('button', { name: 'Show 60 more' }).click();
  await expect(unit.getByText(/^Showing 60 of/)).toHaveCount(0);
  expect(await unit.locator('li[data-topic-id]').count()).toBe(65);
  expect(await axeProblems(page)).toEqual([]);
  await expectClean(seen);
});

test('Entry points: the palette opens Reagents, Named reactions, Mechanisms and Syllabus; Alt+Enter on a reagent hit; the inspector opens Reagents', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(() => undefined));
  await leaveChapters(page).catch(() => undefined);
  for (const [title, heading] of [['Go to Reagents', 'Reagents'], ['Go to Named reactions', 'Named reactions'], ['Go to Mechanisms', 'Mechanisms'], ['Go to Syllabus', 'Syllabus']] as const) {
    await page.keyboard.press('Control+k');
    await palette(page).getByRole('combobox').fill(`>${title}`);
    await palette(page).getByRole('option', { name: title }).first().click();
    await expect(region(page, heading).getByRole('heading', { level: 2, name: heading })).toBeVisible({ timeout: 60_000 });
  }
  // Alt+Enter on a reagent hit opens that reagent in Reagents
  await page.keyboard.press('Control+k');
  await palette(page).getByRole('combobox').fill('Potassium permanganate');
  const hit = palette(page).getByRole('option', { name: /Potassium permanganate/ }).filter({ hasText: /reagent/i }).first();
  await expect(hit).toBeVisible({ timeout: 60_000 });
  await hit.hover();
  await page.keyboard.press('Alt+Enter');
  await expect(region(page, 'Reagents').getByRole('heading', { level: 2, name: /Potassium permanganate/ })).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: `${shotsDir()}/dod-entry-points-1280x800.png` });
  await expectClean(seen);
});
