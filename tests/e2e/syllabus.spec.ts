/**
 * The Syllabus view (step 7.6 D), every engine, over the demo imported as the visitor's own data (the same records on the Studio build and on
 * the live Study site). A second version of JEE Main (and one official wording) is the test's OWN data; the demo's chemistry is not edited.
 * The version select and its default; the status in words; the totals line; the partial chip; a gap row ("—" in Study, "Nothing here yet" in
 * Studio); the "Not in this syllabus" line; "Gaps only" in Studio only; the comparison ("What changed") and its chapter link; both selects
 * survive a reload; axe on each state; zero CSP violations. Screenshots: syllabus, syllabus-gaps-studio, syllabus-gap-study,
 * syllabus-compare, syllabus-official-wording (all -1280x800.png).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, leaveChapters, watch } from './kit';
import { shotsDir } from './editor-kit';
import { changedDemo, importOwn, recordsOf } from './own-data-kit';

test.use({ actionTimeout: 60_000 });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Syllabus', exact: true });

type Unit = { id: string; title: string; officialText?: string; topicCoverage: { topicId: string; coverage: string }[] };
type Version = { id: string; label: string; year?: number; status: string; units: Unit[] };

/** Own data: JEE Main 2026 gets an official wording; a second version "JEE Main 2025" differs in three topics. */
function withSecondVersion(records: Record<string, unknown>): void {
  const versions = recordsOf<Version>(records, 'exam_version');
  const main = versions.find((v) => v.id === 'exv_jee-main-2026') as Version;
  main.units[0]!.officialText = 'As the board published it.';
  const older = JSON.parse(JSON.stringify(main)) as Version;
  older.id = 'exv_jee-main-2025';
  older.label = 'JEE Main 2025';
  older.year = 2025;
  older.units.forEach((unit, i) => (unit.id = `unt_jee-main-2025-u${i + 1}`));
  older.units[0]!.officialText = undefined;
  // new in 2026: Practical organic chemistry (absent in 2025); changed: Hydrocarbons was partial; gone: Polymers was included, Biomolecules stays
  older.units = older.units.filter((unit) => unit.topicCoverage[0]?.topicId !== 'top_practical');
  const hydro = older.units.find((unit) => unit.topicCoverage[0]?.topicId === 'top_hydrocarbons');
  if (hydro) hydro.topicCoverage[0]!.coverage = 'partial';
  const table = records.exam_version;
  if (Array.isArray(table)) table.push(older);
  else (table as Record<string, unknown>)[older.id] = older;
}

async function openSyllabus(page: Page): Promise<void> {
  await leaveChapters(page);
  await rail(page).getByRole('button', { name: 'Syllabus' }).click();
  await expect(view(page).getByRole('heading', { level: 2, name: 'Syllabus' })).toBeVisible();
}

test('the select, the status, the totals, a partial chip, a gap row, the excluded line and the official wording', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(withSecondVersion));
  await openSyllabus(page);

  // with no exam scope the default is the newest version of the first exam (by name)
  const select = view(page).getByLabel('Exam version');
  await expect(select.locator('optgroup')).toHaveCount(2);
  await select.selectOption({ label: 'JEE Main 2026 (provisional)' });
  await expect(view(page).getByText('Provisional — not verified against the published syllabus')).toBeVisible();
  await expect(view(page).getByText(/^\d+ topics in this syllabus · \d+ with content · \d+ not covered yet$/)).toBeVisible();
  expect(await view(page).locator('[data-unit-id]').count()).toBeGreaterThanOrEqual(10);

  // a partial chip (Polymers), a gap row, the excluded line
  const polymers = view(page).locator('[data-topic-id="top_polymers"]').first();
  await expect(polymers.getByText('partly')).toBeVisible();
  const studio = (await view(page).getByLabel('Gaps only').count()) > 0;
  const gap = view(page).locator('[data-gap]').first();
  await expect(gap).toBeVisible();
  await expect(gap).toContainText(studio ? 'Nothing here yet' : '—');
  await expect(view(page).getByText('Not in this syllabus: Molecular rearrangements')).toBeVisible();
  expect(await axeProblems(page)).toEqual([]);
  await page.screenshot({ path: `${shotsDir()}/syllabus-1280x800.png` });
  if (!studio) await page.screenshot({ path: `${shotsDir()}/syllabus-gap-study-1280x800.png` });

  // the official wording is closed until opened
  const wording = view(page).locator('details').first();
  await expect(wording).not.toHaveAttribute('open', '');
  await wording.locator('summary').click();
  await expect(wording).toContainText('As the board published it.');
  await page.screenshot({ path: `${shotsDir()}/syllabus-official-wording-1280x800.png` });

  // Gaps only exists in Studio only
  if (studio) {
    await view(page).getByLabel('Gaps only').check();
    await expect(view(page).locator('[data-topic-id]:not([data-gap])')).toHaveCount(0);
    expect(await axeProblems(page)).toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/syllabus-gaps-studio-1280x800.png` });
    await view(page).getByLabel('Gaps only').uncheck();
  } else {
    await expect(view(page).getByLabel('Gaps only')).toHaveCount(0);
  }
  await expectClean(seen);
});

test('compare with an older version: What changed, a chapter link, and both selects survive a reload', async ({ page }) => {
  test.setTimeout(480_000);
  const seen = await watch(page);
  await importOwn(page, changedDemo(withSecondVersion));
  await openSyllabus(page);

  await view(page).getByLabel('Exam version').selectOption({ label: 'JEE Main 2026 (provisional)' });
  await view(page).getByLabel('Compare with').selectOption({ label: 'JEE Main 2025' });
  const changes = view(page).getByRole('region', { name: 'What changed' });
  await expect(changes.getByRole('heading', { name: 'New in JEE Main 2026 (provisional)' })).toBeVisible();
  await expect(changes.getByRole('heading', { name: 'Not in JEE Main 2026 (provisional) any more' })).toBeVisible();
  await expect(changes.getByRole('heading', { name: 'Changed', exact: true })).toBeVisible();
  await expect(changes.locator('[data-topic-id="top_practical"]')).toContainText('affects');
  await expect(changes.locator('[data-topic-id="top_hydrocarbons"]')).toContainText('partial → included');
  expect(await axeProblems(page)).toEqual([]);

  // both selects come back after a reload
  await page.waitForTimeout(1000); // the saved state is written after a short pause (SAVE_DEBOUNCE_MS)
  await page.reload();
  await leaveChapters(page).catch(() => undefined);
  await rail(page).getByRole('button', { name: 'Syllabus' }).click();
  await expect(view(page).getByLabel('Exam version')).toHaveValue('exv_jee-main-2026', { timeout: 60_000 });
  await expect(view(page).getByLabel('Compare with')).toHaveValue('exv_jee-main-2025');

  // the screenshot is taken after the reload: WebKit's inspector style (counted per page load) is then forgiven by expectClean
  await page.screenshot({ path: `${shotsDir()}/syllabus-compare-1280x800.png` });

  // a chapter link opens the chapter in the Chapters view
  await view(page).getByRole('region', { name: 'What changed' }).getByRole('button', { name: /^Open chapter/ }).first().click();
  await expect(page.getByRole('region', { name: 'Chapters', exact: true })).toBeVisible();
  await expectClean(seen);
});
