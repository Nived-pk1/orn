/**
 * The student's first run and "Only <exam>" (step 8.3b, B1-B3), the STUDY build (port 4174), every engine. A student with the demo as their own
 * data is asked once "Which exam are you preparing for?"; choosing JEE Main hides what is outside it in Reactions (one quiet line says how many,
 * "Show them" brings them back, dimmed); the card never comes back after a reload. Desktop 1280 x 800, Pixel 7 (Chromium) and iPhone 14 (WebKit).
 * Screenshots: exam-first-run-1280x800.png, exam-first-run-pixel7.png, exam-only-reactions-1280x800.png, exam-everything-reactions-1280x800.png.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { chooseFile, expectClean, expectPreview, watch } from './kit';
import { shotsDir } from './editor-kit';
import { answerExamCard, expectStorageLineWhole } from './exam-kit';
import { hintOverlaps } from './map-toolbar-kit';
import { boxTitlePx } from './box-text';

const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
test.use({ baseURL: STUDY });

const DEMO_FILE = { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) };
const { defaultBrowserType: _ios, ...IPHONE } = devices['iPhone 14'];
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const CARD = 'Which exam are you preparing for?';
const card = (page: Page) => page.getByRole('dialog', { name: CARD });

async function importDemo(page: Page, phone: boolean): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
  await chooseFile(page, DEMO_FILE);
  await expectPreview(page);
  const confirm = page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' });
  if (phone) await confirm.tap();
  else await confirm.click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
}

test.describe('desktop', () => {
  test('the Study map: box titles at least 12 px at 1280 x 800 and 13 px at 1920 x 1000 (the demo as own data); screenshots', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page, STUDY);
    await page.setViewportSize({ width: 1280, height: 800 });
    await importDemo(page, false);
    await answerExamCard(page);
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('group', { name: /^Navigator: [0-9]+ hubs?/ })).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1000);
    const small = await boxTitlePx(page);
    console.log(`demo 1280x800 Study: box title ${small.toFixed(2)} px`);
    expect(small).toBeGreaterThanOrEqual(12);
    expect(await hintOverlaps(page), 'the hint is clear of every box (Study 1280 x 800)').toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/map-room-study-1280x800.png` });
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(900);
    const large = await boxTitlePx(page);
    console.log(`demo 1920x1000 Study: box title ${large.toFixed(2)} px`);
    expect(large).toBeGreaterThanOrEqual(13);
    expect(await hintOverlaps(page), 'the hint is clear of every box (Study 1920 x 1000)').toEqual([]);
    await page.screenshot({ path: `${shotsDir()}/map-room-study-1920x1000.png` });
    await expectClean(seen);
  });

  test('the card asks once; JEE Main hides what is outside it in Reactions; Show them brings it back; a reload does not ask again', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page, STUDY);
    await page.setViewportSize({ width: 1280, height: 800 });
    await importDemo(page, false);
    await expect(card(page)).toBeVisible({ timeout: 30_000 });
    for (const name of ['JEE Main', 'JEE Advanced', 'Just exploring']) await expect(card(page).getByRole('button', { name })).toBeVisible();
    await page.screenshot({ path: `${shotsDir()}/exam-first-run-1280x800.png` });
    await card(page).getByRole('button', { name: 'JEE Main' }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /^Exam$/ })).toHaveValue('exm_jee-main');
    await expect(page.getByRole('radio', { name: 'Only JEE Main' })).toBeChecked();

    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Reactions', exact: true }).click();
    const view = page.getByRole('region', { name: 'Reactions', exact: true });
    await expect(view.locator('[data-hidden-line]')).toContainText(/\d+ reactions? outside JEE Main (is|are) hidden · Show (them|it)/);
    expect(((await view.textContent()) ?? '').match(/hidden/g)?.length, '"hidden" is said once (ADR-046)').toBe(1);
    const only = await view.locator('article[data-reaction-id]').count();
    await page.screenshot({ path: `${shotsDir()}/exam-only-reactions-1280x800.png` });
    await view.getByRole('button', { name: /^Show (them|it)$/ }).click();
    await expect(view.locator('[data-hidden-line]')).toHaveCount(0);
    await expect(view.locator('article[data-outside]').first()).toContainText('outside JEE Main'); // back, dimmed and marked in words
    expect(await view.locator('article[data-reaction-id]').count()).toBeGreaterThan(only);
    await page.screenshot({ path: `${shotsDir()}/exam-everything-reactions-1280x800.png` });
    expect(await page.getByRole('combobox', { name: /^Exam$/ }).locator('option').allTextContents()).toEqual(['All exams', 'JEE Advanced', 'JEE Main']); // no version words for a student
    await expect(page.getByRole('combobox', { name: 'Version' })).toHaveCount(0);

    await page.waitForTimeout(1200); // the saved state is written after a short pause
    await expectClean(seen); // a reload loses the watcher's count of the styles WebKit's screenshot injects: a new watcher after it
    await page.reload();
    const afterReload = await watch(page, STUDY);
    await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(card(page)).toHaveCount(0); // never again
    await expect(page.getByRole('combobox', { name: /^Exam$/ })).toHaveValue('exm_jee-main');
    await expectClean(afterReload);
  });

  test('"Just exploring" means All exams, and the card does not come back', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page, STUDY);
    await page.setViewportSize({ width: 1280, height: 800 });
    await importDemo(page, false);
    await card(page).getByRole('button', { name: 'Just exploring' }).click();
    await expect(page.getByRole('combobox', { name: /^Exam$/ })).toHaveValue('');
    await expect(page.getByRole('radiogroup', { name: 'Show' })).toHaveCount(0);
    await page.waitForTimeout(1200);
    await expectClean(seen);
    await page.reload();
    const afterReload = await watch(page, STUDY);
    await page.waitForTimeout(1500);
    await expect(card(page)).toHaveCount(0);
    await expectClean(afterReload);
  });
});

for (const [label, options, engine, phoneShot] of [['Pixel 7 (Chromium)', PIXEL, 'chromium', 'exam-first-run-pixel7.png'], ['iPhone 14 (WebKit)', IPHONE, 'webkit', 'exam-first-run-iphone14.png']] as const) {
  test.describe(label, () => {
    test.use({ ...options });
    test('the card asks once; the chip at the top shows the exam; Reactions hides what is outside it', async ({ page, browserName }) => {
      test.skip(browserName !== engine, `the ${label} profile is ${engine}`);
      test.setTimeout(240_000);
      const seen = await watch(page, STUDY);
      await importDemo(page, true);
      await expect(card(page)).toBeVisible({ timeout: 30_000 });
      await expectStorageLineWhole(page);
      await page.screenshot({ path: `${shotsDir()}/${phoneShot}` });
      await card(page).getByRole('button', { name: 'JEE Main' }).tap();
      await expect(card(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'JEE Main', exact: true })).toBeVisible(); // the exam chip at the top
      await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
      const view = page.getByRole('region', { name: 'Reactions', exact: true });
      await expect(view.locator('[data-hidden-line]')).toContainText(/outside JEE Main (is|are) hidden/, { timeout: 60_000 });
      await view.getByRole('button', { name: /^Show (them|it)$/ }).tap();
      await expect(view.locator('[data-hidden-line]')).toHaveCount(0);
      // "Change exam" from the chip opens the same card with the exam marked
      await page.getByRole('button', { name: 'JEE Main', exact: true }).tap();
      await expect(page.getByRole('dialog', { name: 'Change exam' })).toBeVisible();
      await page.getByRole('dialog', { name: 'Change exam' }).getByRole('button', { name: 'Just exploring' }).tap();
      await expect(page.getByRole('button', { name: 'All exams', exact: true })).toBeVisible();
      await page.waitForTimeout(1200);
      await expectClean(seen);
      await page.reload();
      const afterReload = await watch(page, STUDY);
      await page.waitForTimeout(1500);
      await expect(card(page)).toHaveCount(0);
      await expectClean(afterReload);
    });
  });
}
