/**
 * Step 8.4g, Part B (G4): the first-run tour in the STUDY build. After the exam question, three coach marks (Map item, Search button, Starred item; step C: every mark is anchored), Skip on each,
 * never shown again (it survives a reload), reachable by keyboard, no animation under reduced motion; desktop and Pixel 7 (Chromium, WebKit).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { chooseFile, expectPreview } from './kit';

const STUDY = process.env.ORN_BASE_URL?.replace(/\/+$/, '') ?? 'http://127.0.0.1:4174';
test.use({ baseURL: STUDY });

const DEMO_FILE = { name: 'my-own-data.orn.json', mimeType: 'application/json', buffer: readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json')) };
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const tour = (page: Page) => page.getByRole('region', { name: 'Tour' });
const MARKS = ['The Map shows every family. Tap one to see what it makes and what it is made from.', 'Find any compound, reaction or reagent', 'Press the star on any record to keep it here for revision.'];

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

async function answerQuestion(page: Page, phone: boolean): Promise<void> {
  const card = page.getByRole('dialog', { name: 'Which exam are you preparing for?' });
  await expect(card).toBeVisible({ timeout: 60_000 });
  const just = card.getByRole('button', { name: 'Just exploring' });
  if (phone) await just.tap();
  else await just.click();
  await expect(card).toHaveCount(0);
}

async function shot(page: Page, name: string): Promise<void> {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForTimeout(250);
  await page.screenshot({ path: `screenshots/C/${name}-light.png` });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `screenshots/C/${name}-dark.png` });
  await page.emulateMedia({ colorScheme: 'light' });
}

test.describe('the first-run tour (desktop)', () => {
  test('three marks after the exam question; Next goes on, keyboard reaches it, Skip ends it for good', async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await importDemo(page, false);
    await expect(tour(page)).toHaveCount(0); // the exam question comes first
    await answerQuestion(page, false);
    await expect(tour(page)).toBeVisible();
    await expect(page.getByText(MARKS[0] as string)).toBeVisible();
    await expect(tour(page)).toHaveAttribute('data-anchored', 'true');
    await shot(page, 'tour-1-desktop');
    await expect(page.getByRole('button', { name: 'Next' })).toBeFocused(); // reachable by keyboard
    await page.keyboard.press('Enter');
    await expect(page.getByText(MARKS[1] as string)).toBeVisible();
    await expect(tour(page)).toHaveAttribute('data-anchored', 'true');
    await shot(page, 'tour-2-desktop');
    await page.keyboard.press('Enter');
    await expect(page.getByText(MARKS[2] as string)).toBeVisible();
    await expect(tour(page)).toHaveAttribute('data-anchored', 'true');
    await shot(page, 'tour-3-desktop');
    await page.getByRole('button', { name: 'Skip' }).click();
    await expect(tour(page)).toHaveCount(0);
    await page.waitForTimeout(1500); // the flag is written after a short pause
    await page.reload();
    await expect(page.getByRole('navigation', { name: 'Modes' })).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(3000);
    await expect(tour(page)).toHaveCount(0); // never shown again
  });

  test('with reduced motion the mark has no animation', async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await importDemo(page, false);
    await answerQuestion(page, false);
    await expect(tour(page)).toBeVisible();
    expect(await tour(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  });
});

test.describe('the first-run tour (Pixel 7)', () => {
  test.use({ ...PIXEL });
  test('the three marks stay inside the window and each has Skip', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
    test.setTimeout(240_000);
    await importDemo(page, true);
    await answerQuestion(page, true);
    await expect(tour(page)).toBeVisible();
    const view = page.viewportSize() ?? { width: 412, height: 915 };
    for (let at = 0; at < 3; at++) {
      await expect(page.getByText(MARKS[at] as string)).toBeVisible();
      const box = await tour(page).boundingBox();
      if (box === null) throw new Error('no mark');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(view.width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(view.height + 1);
      await expect(page.getByRole('button', { name: 'Skip' })).toBeVisible();
      await expect(tour(page)).toHaveAttribute('data-anchored', 'true');
      await shot(page, `tour-${at + 1}-pixel7`);
      if (at < 2) await page.getByRole('button', { name: 'Next' }).tap();
    }
    await page.getByRole('button', { name: 'Done' }).tap();
    await expect(tour(page)).toHaveCount(0);
  });
});
