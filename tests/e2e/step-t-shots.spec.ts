/**
 * Step T, K3 (screenshots for the reviewer; the review project, on demand): (a) a found route through a generic reaction, with its warning words;
 * (b) the Starred view with a record open. Light and dark, desktop 1280 x 800. Studio, demo data, Chromium.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp } from './kit';
import { familyIds } from './map-focus-kit';
import { paintSettled } from './settled-kit';

test.use({ actionTimeout: 60_000 });
const NAV = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const view = (page: Page) => page.getByRole('region', { name: 'Precursors', exact: true });

async function both(page: Page, name: string): Promise<void> {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await paintSettled(page);
    await page.screenshot({ path: `screenshots/T/${name}-${scheme}.png` });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

async function start(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: NAV })).toBeVisible({ timeout: 90_000 });
}

test('K3a: a found route through a generic reaction shows its warning words', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(300_000);
  await start(page);
  await rail(page).getByRole('button', { name: 'Precursors' }).click();
  const pick = async (label: string, text: string, hit: string): Promise<void> => {
    const box = view(page).getByRole('searchbox', { name: label, exact: true });
    const button = view(page).getByRole('button', { name: hit, exact: true });
    await expect(async () => {
      await box.fill('');
      await box.fill(text);
      await expect(button).toBeVisible({ timeout: 3000 });
    }).toPass({ timeout: 60_000 });
    await button.click();
  };
  await pick('Compound to make', 'propan-2-ol', 'Choose Propan-2-ol');
  await pick('Start from (optional)', 'ethanol', 'Start from Ethanol');
  await view(page).getByRole('button', { name: 'Search', exact: true }).click();
  const routes = view(page).getByRole('region', { name: 'Routes found' }).getByRole('list', { name: 'Routes' }).locator(':scope > li');
  await expect(routes).toHaveCount(3);
  const generic = routes.nth(2);
  await generic.scrollIntoViewIfNeeded();
  const toasts = page.getByRole('status', { name: 'Notifications' }).getByRole('button', { name: 'Dismiss' });
  for (let left = await toasts.count(); left > 0; left = await toasts.count()) await toasts.first().click();
  console.log(`K3a the third route says: ${((await generic.textContent()) ?? '').slice(0, 300)}`);
  await both(page, 'route-through-generic');
});

test('K3b: the Starred view with a record open', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(300_000);
  await start(page);
  const [id] = await familyIds(page);
  await page.locator(`svg [data-node-id="${id as string}"]`).click();
  await page.keyboard.press('s');
  await expect(page.getByRole('button', { name: 'Star for revision' })).toHaveAttribute('aria-pressed', 'true');
  await rail(page).getByRole('button', { name: 'Starred', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Classes' })).toBeVisible();
  // the record chosen on the Map stays chosen: its inspector sits beside the Starred list (opening a row of the list would leave the view for the Map)
  const show = page.getByRole('button', { name: 'Show inspector' });
  if (await show.isVisible()) await show.click();
  await expect(page.getByRole('button', { name: 'Hide inspector' })).toBeVisible();
  await expect(page.getByText(/has no place in this view/)).toHaveCount(0);
  console.log(`K3b hash ${await page.evaluate(() => location.hash)}; the Starred list is visible: ${await page.getByRole('region', { name: 'Classes' }).isVisible()}`);
  await both(page, 'starred-record-open');
});
