/**
 * Step 8.4g, Part B (P1 to P4, then G2 to G5): ONE record menu, the phone sheet header, the error and not-found screens as real screens
 * (buttons, no rail item lit, the breadcrumb names the screen), the first address written at boot. Studio, demo data.
 */
import { devices, type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { loadDemo, openApp, openPhoneApp } from './kit';
import { familyIds } from './map-focus-kit';
import { phoneFamily } from './map-layout-kit';

const NAV = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const hash = (page: Page): Promise<string> => page.evaluate(() => location.hash);
const rail = (page: Page) => page.getByRole('navigation', { name: 'Modes' });
const crumb = (page: Page) => page.getByRole('navigation', { name: 'Breadcrumb' });
const goTo = (page: Page, name: string) => rail(page).getByRole('button', { name, exact: true }).click();

async function demo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByRole('group', { name: NAV })).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(600);
}

test.describe('P1 and P3: one menu, real screens', () => {
  test('a record has ONE "⋯" menu (no "More actions")', async ({ page }) => {
    await demo(page);
    const [id] = await familyIds(page);
    await page.locator(`svg [data-node-id="${id as string}"]`).click();
    await expect(page.getByRole('button', { name: 'Record menu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0);
    await page.setViewportSize({ width: 900, height: 700 }); // a narrow pane pushes go-next actions into the menu
    await page.waitForTimeout(500);
    await expect(page.getByRole('button', { name: 'More actions' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Record menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
  });

  test('the not-found screen: a primary button, no rail item lit, the breadcrumb names it', async ({ page }) => {
    await demo(page);
    await page.evaluate(() => {
      location.hash = '#/nowhere';
    });
    const go = page.getByRole('button', { name: 'Go to Chapters' });
    await expect(go).toBeVisible();
    await expect(go).toHaveAttribute('data-kind', 'primary');
    await expect(rail(page).locator('[aria-current]')).toHaveCount(0);
    await expect(crumb(page)).toContainText('Not found');
    await go.click();
    await expect(crumb(page)).toContainText('Chapters');
    await expect(rail(page).locator('[aria-current]')).toHaveCount(1);
  });

  test('the error screen: Reload is primary, Back up now a real button, no rail item lit, the breadcrumb names it', async ({ page }) => {
    await demo(page);
    await page.route('**/assets/settings-host-*.js', (route) => route.abort());
    await goTo(page, 'Settings');
    await expect(page.getByRole('button', { name: 'Back up now' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reload' })).toHaveAttribute('data-kind', 'primary');
    await expect(page.getByRole('button', { name: 'Back up now' })).toHaveAttribute('data-kind', 'secondary');
    await expect(rail(page).locator('[aria-current]')).toHaveCount(0);
    await expect(crumb(page)).toContainText('Something went wrong');
    await page.unroute('**/assets/settings-host-*.js');
    await goTo(page, 'Reactions'); // leaving the broken screen tries again
    await expect(crumb(page)).toContainText('Reactions');
    await expect(rail(page).locator('[aria-current]')).toHaveCount(1);
  });
});

test.describe('P4: the first address', () => {
  test('is written at boot by replacing, so the first click already has a Back entry', async ({ page }) => {
    await demo(page);
    expect(await hash(page)).toBe('#/map');
    await goTo(page, 'Reactions');
    await expect.poll(() => hash(page)).toBe('#/reactions');
    await page.goBack();
    await expect.poll(() => hash(page)).toBe('#/map');
    await expect(crumb(page)).toContainText('Map');
  });
});

const { defaultBrowserType: _pixel, ...PIXEL } = devices['Pixel 7'];
test.describe('P2: the phone sheet header', () => {
  test.use({ ...PIXEL });
  test('the record name has its own full line; the menu link is not a blue underlined link', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox has no mobile emulation');
    await openPhoneApp(page);
    await loadDemo(page);
    await page.getByRole('navigation', { name: 'Home' }).getByRole('button', { name: 'Map' }).tap();
    await expect(page.getByRole('group', { name: NAV })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('button', { name: 'Fit', exact: true })).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    const id = await phoneFamily(page);
    await page.locator(`svg [data-node-id="${id}"]`).tap();
    const sheet = page.locator('[data-sheet]');
    const title = sheet.getByRole('heading', { level: 3 });
    await expect(title).toBeVisible();
    const t = await title.boundingBox();
    const s = await sheet.boundingBox();
    const chip = await sheet.getByRole('button', { name: 'Record menu' }).boundingBox();
    if (t === null || s === null || chip === null) throw new Error('no boxes');
    expect(t.y).toBeGreaterThanOrEqual(chip.y + chip.height - 2); // its own line, below the chips and the menu
    expect(t.width).toBeGreaterThan(s.width * 0.6);
    expect(await title.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true); // not cut ("A..")
    await page.getByRole('button', { name: 'Record menu' }).tap();
    const link = page.getByRole('menuitem', { name: 'Report a mistake' });
    await expect(link).toBeVisible();
    const looks = await link.evaluate((el) => {
      const own = getComputedStyle(el);
      const other = getComputedStyle(el.parentElement?.querySelector('[role="menuitem"]:not([href])') ?? el);
      return { line: own.textDecorationLine, same: own.color === other.color };
    });
    expect(looks.line).toBe('none');
    expect(looks.same).toBe(true);
    await page.waitForTimeout(400);
    await page.screenshot({ path: 'screenshots/8.4g/B/phone-record-menu.png' });
  });
});
