/**
 * Step 8.5g (screenshots for the reviewer; the review project, on demand; Chromium, demo data, Studio build): aldol steps 1 to 3 and the SN2 step,
 * desktop 1280 x 800 light and dark, Pixel 7 light. ORN_SHOTS=before|after names the files.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { leaveChapters, loadDemo, openPhoneApp } from './kit';
import { changedDemo, importOwn } from './own-data-kit';
import { paintSettled } from './settled-kit';

test.use({ actionTimeout: 60_000 });
const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Mechanisms', exact: true });
const ALDOL = 'Aldol addition of ethanal';
const SN2 = 'SN2 substitution of a haloalkane';

/** The "Imported n records" toast would sit over the picture: close what is open. */
async function dismissToasts(page: Page): Promise<void> {
  if ((await page.locator('dialog[open]').count()) > 0) return; // a modal dialog covers the toasts and takes the clicks
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
}

const WHEN = process.env.ORN_SHOTS ?? 'after';

async function both(page: Page, target: Locator | Page, name: string, schemes: readonly ('light' | 'dark')[] = ['light', 'dark']): Promise<void> {
  await dismissToasts(page);
  for (const scheme of schemes) {
    await page.emulateMedia({ colorScheme: scheme });
    await paintSettled(page);
    await target.screenshot({ path: `screenshots/8.5g/${WHEN}-${name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function openMechanism(page: Page, name: string): Promise<void> {
  if (!(await view(page).isVisible())) {
    await leaveChapters(page);
    await rail(page).getByRole('button', { name: 'Mechanisms' }).click();
  }
  await view(page).getByRole('list', { name: 'Mechanisms' }).locator('[data-mechanism-id]').filter({ hasText: name }).getByRole('button', { name }).click();
  await expect(view(page).getByRole('heading', { level: 2, name })).toBeVisible();
}
const step = (page: Page, title: string): Locator => view(page).locator('[data-step]').filter({ hasText: title }).first();
const drawn = (scope: Locator): Locator => scope.getByRole('img', { name: /^Drawing of step \d+; the details are below\.$/ });

test('desktop: aldol step 1, aldol step 2, the SN2 step', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await importOwn(page, changedDemo(() => undefined));
  await openMechanism(page, ALDOL);
  for (const [title, name] of [['Hydroxide removes an α-hydrogen to give the enolate', 'aldol-1-desktop'], ['Enolate carbon attacks a second ethanal', 'aldol-2-desktop'], ['Alkoxide is protonated by water', 'aldol-3-desktop']] as const) {
    const one = step(page, title);
    await expect(drawn(one)).toBeVisible({ timeout: 90_000 });
    await one.scrollIntoViewIfNeeded();
    await both(page, one, name);
  }
  await view(page).getByRole('button', { name: 'All mechanisms' }).click();
  await openMechanism(page, SN2);
  const sn2 = view(page).locator('[data-step]').first();
  await expect(drawn(sn2)).toBeVisible({ timeout: 90_000 });
  await both(page, sn2, 'sn2-desktop');
});

test.describe('phone: Pixel 7', () => {
  test.use({ ...PIXEL });
  test('the same three steps on a phone', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(480_000);
    await openPhoneApp(page);
    await loadDemo(page);
    await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
    await page.getByRole('combobox', { name: 'Show:' }).selectOption({ label: 'Mechanisms' });
    const mechanisms = page.getByRole('region', { name: 'Mechanisms', exact: true });
    await mechanisms.getByRole('button', { name: ALDOL }).tap();
    for (const [title, name] of [['Hydroxide removes an α-hydrogen to give the enolate', 'aldol-1-phone'], ['Enolate carbon attacks a second ethanal', 'aldol-2-phone'], ['Alkoxide is protonated by water', 'aldol-3-phone']] as const) {
      const one = mechanisms.locator('[data-step]').filter({ hasText: title }).first();
      await expect(drawn(one)).toBeVisible({ timeout: 90_000 });
      await one.scrollIntoViewIfNeeded();
      await both(page, one, name, ['light']);
    }
    await mechanisms.getByRole('button', { name: 'All mechanisms' }).tap();
    await mechanisms.getByRole('button', { name: SN2 }).tap();
    const sn2 = mechanisms.locator('[data-step]').first();
    await expect(drawn(sn2)).toBeVisible({ timeout: 90_000 });
    await sn2.scrollIntoViewIfNeeded();
    await both(page, sn2, 'sn2-phone', ['light']);
  });
});
