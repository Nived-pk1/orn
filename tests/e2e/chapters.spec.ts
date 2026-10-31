/**
 * The Chapters view on a desktop (step 7.3b D1-D6), the STUDIO production build, every engine, over a changed copy of the demo
 * (tests/e2e/chapters-kit.ts): "Chapters" is the first mode of the rail; the list has the chapters with their counts in words and "No chapter
 * yet" last; a chapter page has its groups in the study order with "Also used here" for supporting records and a study card per record; a
 * click selects the record in the inspector, whose "In chapters" line links back to a chapter; the exam scope hides the chapters a version
 * does not cover; "No chapter yet" lists the unmapped record; the open chapter and its filter survive a reload. Axe on each state, zero CSP
 * violations. Screenshots: chapters-list, chapter-page, chapter-page-supporting, chapter-no-chapter, chapters-exam-scope,
 * inspector-in-chapters (all -1280x800.png).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, watch } from './kit';
import { record, shotsDir } from './editor-kit';
import { importOwn } from './own-data-kit';
import { CHAPTER_A, CHAPTER_B, chaptersDemo, UNMAPPED } from './chapters-kit';

test.use({ actionTimeout: 60_000 });
const view = (page: Page) => page.getByRole('region', { name: 'Chapters', exact: true });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const rows = (page: Page) => view(page).getByRole('list', { name: 'Chapters' }).locator('[data-chapter-id]');

async function openChapters(page: Page): Promise<void> {
  await rail(page).getByRole('button', { name: 'Chapters' }).click();
  await expect(view(page)).toBeVisible();
}

test('the list, a chapter page, selecting, the inspector line, the exam scope and No chapter yet', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, chaptersDemo());

  // D1: the first mode of the rail, and no Syllabus placeholder
  await expect(rail(page).getByRole('button').first()).toHaveText(/^Chapters/);
  await expect(rail(page).getByRole('button', { name: /Syllabus/ })).toHaveCount(0);
  await openChapters(page);

  // D2: the list
  await expect(rows(page).first()).toBeVisible();
  const titles = await rows(page).locator('button').allTextContents();
  expect(titles.at(-1)).toBe('No chapter yet');
  expect(titles).toContain(CHAPTER_A);
  const rowA = rows(page).filter({ hasText: CHAPTER_A });
  await expect(rowA).toContainText(/\d+ concepts?/);
  await expect(rowA).toContainText(/JEE (Advanced|Main) 2026/); // exam chips
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/chapters-list-1280x800.png` });

  // D3: the page
  await rowA.getByRole('button', { name: CHAPTER_A }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: CHAPTER_A })).toBeVisible();
  const groups = await view(page).getByRole('heading', { level: 3 }).allTextContents();
  const order = ['Concepts', 'Reactions', 'Named reactions', 'Mechanisms', 'Caveats and traps', 'Compounds and classes', 'Reagents', 'Routes', 'Transformations'];
  expect(groups.map((text) => text.replace(/ \(\d+\)$/, ''))).toEqual(order);
  await expect(view(page).getByRole('heading', { level: 4, name: 'Also used here' }).first()).toBeVisible();
  await expect(view(page).locator('article[data-reaction-id]').first()).toBeVisible({ timeout: 60_000 });
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/chapter-page-1280x800.png` });
  await view(page).getByRole('heading', { level: 4, name: 'Also used here' }).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${shotsDir()}/chapter-page-supporting-1280x800.png` });

  // filters: a kind chip and the name box
  await view(page).getByRole('button', { name: /^Concepts \d+$/ }).click();
  await expect(view(page).getByRole('heading', { level: 3 })).toHaveCount(1);
  await view(page).getByRole('button', { name: /^Concepts \d+$/ }).click();
  await view(page).getByLabel('Find in this chapter').fill('hinsberg');
  await expect(view(page).locator('article[data-reaction-id]')).toHaveCount(1);
  await view(page).getByLabel('Find in this chapter').fill('');

  // a click selects the record in the inspector, whose line links to its chapters
  await view(page).getByRole('article', { name: 'Oxidation' }).first().click();
  await expect(record(page)).toHaveAttribute('data-record-id', 'cpt_oxidation');
  const line = record(page).locator('[data-in-chapters]');
  await expect(line).toContainText('In chapters:');
  await expect(line).toContainText(CHAPTER_A);
  await page.screenshot({ path: `${shotsDir()}/inspector-in-chapters-1280x800.png` });
  await line.getByRole('button', { name: CHAPTER_B }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: CHAPTER_B })).toBeVisible();
  await view(page).getByRole('button', { name: 'All chapters' }).click();

  // the exam scope: the chapters a version does not cover are hidden, and said
  const scope = page.getByRole('combobox', { name: /Exam scope/ });
  await scope.selectOption({ label: 'JEE Main, provisional, not verified' });
  await expect(view(page).getByText(/chapters? (is|are) hidden: not in/)).toBeVisible();
  await expect(rows(page).filter({ hasText: 'Molecular rearrangements' })).toHaveCount(0);
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/chapters-exam-scope-1280x800.png` });
  await scope.selectOption({ value: '' });

  // No chapter yet
  await rows(page).filter({ hasText: 'No chapter yet' }).getByRole('button').click();
  await expect(view(page).getByRole('article', { name: UNMAPPED })).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/chapter-no-chapter-1280x800.png` });
  await view(page).getByRole('button', { name: 'All chapters' }).click();

  await expectClean(seen);
});

// a reload empties the page's count of the styles WebKit's inspector injects for screenshots, so the reload has a test of its own
test('the open chapter and its filter come back after a reload (uiState)', async ({ page }) => {
  test.setTimeout(300_000);
  const seen = await watch(page);
  await importOwn(page, chaptersDemo());
  await openChapters(page);
  await rows(page).filter({ hasText: CHAPTER_A }).getByRole('button', { name: CHAPTER_A }).click();
  await view(page).getByLabel('Find in this chapter').fill('oxid');
  await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
  await page.waitForTimeout(1_000);
  await page.reload();
  await openChapters(page);
  await expect(view(page).getByRole('heading', { level: 2, name: CHAPTER_A })).toBeVisible({ timeout: 60_000 });
  await expect(view(page).getByLabel('Find in this chapter')).toHaveValue('oxid');
  await expectClean(seen);
});
