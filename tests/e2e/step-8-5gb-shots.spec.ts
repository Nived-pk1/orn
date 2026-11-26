/**
 * Step 8.5g Part B (screenshots for the reviewer; the review project, on demand; Chromium, Studio build): the owner's five structures in their
 * reaction cards with Structures: Full, over the owner's exported data in a throwaway browser profile, light and dark, and one Pixel 7 page.
 * ORN_SHOTS=before|after names the files. The data file is outside the repo (`../fable-work/inputs`).
 */
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { importOwn } from './own-data-kit';
import { paintSettled } from './settled-kit';

test.use({ actionTimeout: 120_000 });
const WHEN = process.env.ORN_SHOTS ?? 'after';
const DATA = '../fable-work/inputs/ORN-real-data-2026-11-24.orn.json';
const CARDS = [
  ['glucose-hexane', 'Glucose with red phosphorus and HI'],
  ['propanone-hcn', 'Addition of HCN to propanone'],
  ['grignard', 'CH₃MgBr + propanone, then H₃O⁺'],
  ['pinacol', 'Propanone with magnesium amalgam (pinacol)'],
] as const;

async function full(page: Page): Promise<void> {
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Search' });
  await palette.getByRole('combobox').fill('> structures full');
  await palette.getByRole('option', { name: /Structures: Full/ }).click();
}

async function cardOf(page: Page, name: string) {
  const view = page.getByRole('region', { name: 'Reactions', exact: true });
  await view.getByRole('searchbox').first().fill(name);
  const card = view.locator('article[data-reaction-id]').filter({ has: page.getByRole('heading', { name, exact: true }) }).first();
  await expect(card).toBeVisible({ timeout: 60_000 });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText('Drawing the structure…')).toHaveCount(0, { timeout: 60_000 });
  await paintSettled(page);
  return card;
}

test('desktop: the owner’s structures in Full, light and dark', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(900_000);
  await importOwn(page, { name: 'real.orn.json', mimeType: 'application/json', buffer: readFileSync(DATA) });
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Reactions', exact: true }).click();
  await full(page);
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
  for (const [file, name] of CARDS) {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      const card = await cardOf(page, name);
      await card.screenshot({ path: `screenshots/8.5g/${WHEN}-full-${file}-${scheme}.png` });
    }
  }
});
