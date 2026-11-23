/**
 * Step 8.5 (screenshots for the reviewer; the review project, on demand; Chromium, demo data, Studio build; light and dark, desktop 1280 x 800
 * and a phone 412 x 915): (a) a demo step with lone-pair dots, bond to bond and bond to lone pair, two species in the before row (hydroxide and
 * ethanal); (b) the SN2 step (hydroxide, a substrate with a stereocentre); (c) a step with no atom maps; (d) the Studio editor's live preview
 * while a movement is added: bond to atom and a fishhook (one electron); (e) a transition state, in brackets; (f) a step with no electron
 * movements; (g) the phone layout.
 */
import { devices, type Locator, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { leaveChapters, loadDemo, openPhoneApp } from './kit';
import { openDemo, pane, showRecord } from './editor-kit';
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

async function both(page: Page, target: Locator | Page, name: string): Promise<void> {
  await dismissToasts(page);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await paintSettled(page);
    await target.screenshot({ path: `screenshots/8.5/${name}-${scheme}.png` });
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

test('the study view: aldol step 1, the SN2 step, a step with no atom maps (desktop)', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await importOwn(page, changedDemo(() => undefined));
  await openMechanism(page, ALDOL);
  const first = step(page, 'Hydroxide removes an α-hydrogen to give the enolate');
  await expect(drawn(first)).toBeVisible({ timeout: 90_000 });
  await first.scrollIntoViewIfNeeded();
  await both(page, first, 'aldol-step-1-lone-pairs-desktop');
  const second = step(page, 'Enolate carbon attacks a second ethanal');
  await expect(drawn(second)).toBeVisible();
  await second.scrollIntoViewIfNeeded();
  await both(page, second, 'aldol-step-2-two-species-desktop');
  const none = step(page, 'Carbonyl oxygen is protonated');
  await expect(none.getByText('No drawing: this step has no atom-mapped structures.')).toBeVisible();
  await none.scrollIntoViewIfNeeded();
  await both(page, none, 'no-atom-maps-desktop');
  await view(page).getByRole('button', { name: 'All mechanisms' }).click();
  await openMechanism(page, SN2);
  const sn2 = view(page).locator('[data-step]').first();
  await expect(drawn(sn2)).toBeVisible({ timeout: 90_000 });
  await both(page, sn2, 'sn2-step-desktop');
});

test.describe('phone: Pixel 7', () => {
  test.use({ ...PIXEL });
  test('the phone layout: before above, a down arrow, after below', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the Pixel 7 profile is Chromium');
    test.setTimeout(480_000);
    await openPhoneApp(page);
    await loadDemo(page);
    await expect(page.getByRole('region', { name: 'Families' })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Explore' }).tap();
    await page.getByRole('combobox', { name: 'Show:' }).selectOption({ label: 'Mechanisms' });
    const mechanisms = page.getByRole('region', { name: 'Mechanisms', exact: true });
    await mechanisms.getByRole('button', { name: ALDOL }).tap();
    const first = mechanisms.locator('[data-step]').filter({ hasText: 'Hydroxide removes an α-hydrogen to give the enolate' }).first();
    await expect(drawn(first)).toBeVisible({ timeout: 90_000 });
    await first.scrollIntoViewIfNeeded();
    await both(page, first, 'aldol-step-1-phone');
  });
});

test('the Studio editor: the live preview while a movement is added (bond to atom, a fishhook), a transition state, no movements', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'screenshots are taken in Chromium');
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openDemo(page);
  await showRecord(page, 'm', SN2);
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Edit ${SN2}` });
  await dialog.getByRole('button', { name: 'Edit variant 1', exact: true }).click();
  await dialog.getByRole('button', { name: 'Edit step 1', exact: true }).click();
  const preview = dialog.locator('[data-step-preview]');
  await expect(drawn(preview)).toBeVisible({ timeout: 90_000 });
  // add a bond-to-atom arrow and a fishhook, the way a person would
  await dialog.getByRole('button', { name: 'Add electron movement', exact: true }).click();
  await dialog.getByLabel('From of movement 3').selectOption('bond:1-2');
  await dialog.getByLabel('To of movement 3').selectOption('atom:2');
  await dialog.getByLabel('Electrons of movement 3').selectOption('2');
  await dialog.getByRole('button', { name: 'Add electron movement', exact: true }).click();
  await dialog.getByLabel('From of movement 4').selectOption('radical:2');
  await dialog.getByLabel('To of movement 4').selectOption('atom:3');
  await dialog.getByLabel('Electrons of movement 4').selectOption('1');
  await expect(preview.locator('[data-arrow]')).toHaveCount(4);
  await expect(preview.locator('[data-arrow-head="half"]')).toHaveCount(1);
  await preview.scrollIntoViewIfNeeded();
  await both(page, preview, 'editor-preview-adding-movements');
  // a transition state: the second species row's role
  await dialog.getByLabel('Role of species 2').selectOption('transition_state');
  await expect(preview.locator('[data-bracket]')).toHaveCount(1);
  await both(page, preview, 'editor-preview-transition-state');
  // no movements: remove all four
  for (let n = 4; n >= 1; n -= 1) await dialog.getByRole('button', { name: `Remove movement ${n}`, exact: true }).click();
  await expect(preview.getByText('No electron movements given for this step.')).toBeVisible();
  await both(page, preview, 'editor-preview-no-movements');
});
