/**
 * The Syllabus view on a phone (step 7.6 D): Pixel 7 in Chromium, iPhone 14 in WebKit. The Explore tab's ONE select "Show:" has Syllabus as its
 * sixth choice; the version and compare selects are full width and 44 px; the rows are 44 px; the note of a partial topic is written under the
 * row; the "What changed" section sits above the units; no sideways scroll; axe clean; zero CSP violations. The second version is the test's own
 * data. Screenshots: phone-syllabus-pixel7.png, phone-syllabus-compare-iphone14.png.
 */
import { devices, expect, type Page } from '@playwright/test';
import { test } from './fixtures';
import { axeProblems, chooseFile, expectClean, expectPreview, leaveChapters, openPhoneApp, watch } from './kit';
import { shotsDir } from './editor-kit';
import { changedDemo, recordsOf } from './own-data-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const tabs = (page: Page) => page.getByRole('navigation', { name: 'Home' });
const noSideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const view = (page: Page) => page.getByRole('region', { name: 'Syllabus', exact: true });

type Unit = { id: string; title: string; topicCoverage: { topicId: string; coverage: string; note?: string }[] };
type Version = { id: string; label: string; year?: number; units: Unit[] };

function withSecondVersion(records: Record<string, unknown>): void {
  const versions = recordsOf<Version>(records, 'exam_version');
  const main = versions.find((v) => v.id === 'exv_jee-main-2026') as Version;
  const polymers = main.units.find((u) => u.topicCoverage[0]?.topicId === 'top_polymers');
  if (polymers?.topicCoverage[0] !== undefined) polymers.topicCoverage[0].note = 'Only the basic ideas';
  const older = JSON.parse(JSON.stringify(main)) as Version;
  older.id = 'exv_jee-main-2025';
  older.label = 'JEE Main 2025';
  older.year = 2025;
  older.units.forEach((unit, i) => (unit.id = `unt_jee-main-2025-u${i + 1}`));
  older.units = older.units.filter((unit) => unit.topicCoverage[0]?.topicId !== 'top_practical');
  const table = records.exam_version;
  if (Array.isArray(table)) table.push(older);
  else (table as Record<string, unknown>)[older.id] = older;
}

async function walk(page: Page, device: string, compare: boolean): Promise<void> {
  const seen = await watch(page);
  await openPhoneApp(page);
  await chooseFile(page, changedDemo(withSecondVersion));
  await expectPreview(page);
  await page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
  await leaveChapters(page);
  await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });
  await tabs(page).getByRole('button', { name: 'Explore' }).tap();

  const choose = page.getByRole('combobox', { name: 'Show:' });
  expect(await choose.locator('option').allTextContents()).toEqual(['Reactions', 'Precursors', 'Reagents', 'Named reactions', 'Mechanisms', 'Syllabus']);
  await choose.selectOption({ label: 'Syllabus' });
  await expect(view(page).getByRole('heading', { level: 2, name: 'Syllabus' })).toBeVisible();
  await view(page).getByLabel('Exam version').selectOption({ label: 'JEE Main 2026 (provisional)' });
  await expect(view(page).locator('[data-topic-id]').first()).toBeVisible();

  const width = page.viewportSize()?.width ?? 0;
  for (const name of ['Exam version', 'Compare with']) {
    const box = await view(page).getByLabel(name).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThan(width * 0.8);
    expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 0.5);
  }
  expect(await noSideways(page)).toBe(true);
  for (const height of await view(page).locator('[data-topic-id]').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(height).toBeGreaterThanOrEqual(44);
  await expect(view(page).locator('[data-topic-id="top_polymers"]').first()).toContainText('Only the basic ideas'); // the note is written under the row
  expect(await axeProblems(page, 10)).toEqual([]);
  if (device === 'pixel7') await page.screenshot({ path: `${shotsDir()}/phone-syllabus-${device}.png` });

  if (compare) {
    await view(page).getByLabel('Compare with').selectOption({ label: 'JEE Main 2025' });
    const changes = view(page).getByRole('region', { name: 'What changed' });
    await expect(changes.locator('[data-topic-id="top_practical"]')).toBeVisible();
    const above = await page.evaluate(() => {
      const changes = document.querySelector('[aria-label="What changed"]')?.getBoundingClientRect().top ?? 0;
      const unit = document.querySelector('[data-unit-id]')?.getBoundingClientRect().top ?? 0;
      return changes < unit;
    });
    expect(above).toBe(true);
    expect(await noSideways(page)).toBe(true);
    for (const height of await changes.getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(height).toBeGreaterThanOrEqual(44);
    expect(await axeProblems(page, 10)).toEqual([]);
    await changes.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${shotsDir()}/phone-syllabus-compare-${device}.png` });
  }
  await expectClean(seen);
}

test.describe('phone: Pixel 7 (Chromium)', () => {
  test.use({ ...PIXEL });
  test('the Syllabus choice, the selects, the rows and the note', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(400_000);
    await walk(page, 'pixel7', true);
  });
});

test.describe('phone: iPhone 14 (WebKit)', () => {
  test.use({ ...IPHONE });
  test('the comparison above the units', async ({ page, browserName }) => {
    test.skip(browserName !== 'webkit', 'the iPhone 14 profile is WebKit');
    test.setTimeout(400_000);
    await walk(page, 'iphone14', true);
  });
});
