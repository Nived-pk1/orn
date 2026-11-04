/** Step 8.2a: the own-data layout fixture (tests/fixtures/map-layout, about 20 families, 88 arrows) imported through the normal import path. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import { chooseFile, expectPreview, leaveChapters, openPhoneApp } from './kit';

export const MAP_LAYOUT = readFileSync(resolve(process.cwd(), 'tests/fixtures/map-layout/map-layout.orn.json'));
export const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
export const FAMILY_ONE = 'cls_family-01';

async function confirmImport(page: Page, phone: boolean): Promise<void> {
  await expectPreview(page);
  const confirm = page.getByRole('dialog', { name: 'Import summary' }).getByRole('button', { name: 'Confirm' });
  if (phone) await confirm.tap();
  else await confirm.click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
}

/** Desktop (1280 x 800): the fixture is the visitor's own data and the map is on screen. */
export async function openMapDesktop(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
  await chooseFile(page, { name: 'map-layout.orn.json', mimeType: 'application/json', buffer: MAP_LAYOUT });
  await confirmImport(page, false);
  await leaveChapters(page);
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(800);
}

/** Phone: the fixture imported, then the Map tab. */
export async function openMapPhone(page: Page): Promise<void> {
  await openPhoneApp(page);
  await chooseFile(page, { name: 'map-layout.orn.json', mimeType: 'application/json', buffer: MAP_LAYOUT });
  await confirmImport(page, true);
  await leaveChapters(page);
  await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Map' }).tap();
  await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(800);
}
