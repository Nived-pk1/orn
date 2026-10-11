/**
 * The shell and the design system in Chromium against the PRODUCTION build (step 5.2, notes E3, E13): every primitive a real screen
 * uses is exercised with zero `securitypolicyviolation` events; axe finds nothing at "serious" or above on the first run and on the
 * shell with the demo loaded; fonts come from the origin; the panels survive a reload; the three breakpoints by viewport size. The
 * dialog's focus trap, inert background and Esc are the browser's own here (jsdom cannot show them). The Skeleton has no real screen
 * to appear on yet (the services are built before React renders), so only its component test exercises it.
 */
import { expect, test, type Page } from '@playwright/test';
import { axeProblems, chooseFile, expectClean, generatedFile, loadDemo, openApp, showDataset, watch } from './kit';

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).first().boundingBox();
  if (found === null) throw new Error(`${selector} has no box`);
  return found;
};

test.describe('the shell and the design system', () => {
  test('axe: nothing serious on the first run and on the shell with the demo loaded', async ({ page }) => {
    const seen = await watch(page);
    await openApp(page);
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await loadDemo(page);
    await showDataset(page);
    await expect(page.getByText(/^Findings: E \d+/)).toBeVisible();
    expect(await axeProblems(page)).toEqual([]);
    await expectClean(seen);
  });

  test('fonts are served from the origin and are in use', async ({ page }) => {
    const fonts: { url: string; status: number }[] = [];
    page.on('response', (response) => {
      if (/\.woff2?(\?|$)/.test(response.url())) fonts.push({ url: response.url(), status: response.status() });
    });
    const seen = await watch(page);
    await openApp(page);
    await expect.poll(() => page.evaluate(() => document.fonts.check('400 14px "IBM Plex Sans"'))).toBe(true);
    await expect.poll(() => fonts.length).toBeGreaterThan(0);
    expect(fonts.every((f) => f.url.startsWith('http://127.0.0.1:4173/') && f.status === 200)).toBe(true);
    const family = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(family).toContain('IBM Plex Sans');
    await expectClean(seen); // includes: no request left the origin
  });

  test('every primitive a screen uses works with zero policy violations: button, menu, tooltip, dialog, banner, toast', async ({ page, context }) => {
    const seen = await watch(page);
    await openApp(page);

    // IconButton + Tooltip: keyboard focus shows the tooltip with the reason; Esc hides it.
    await page.getByRole('button', { name: 'Undo' }).focus();
    await expect(page.getByRole('tooltip')).toContainText('Nothing to undo');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);

    // Menu: opens from the keyboard, lists the unavailable items with their reasons, Esc closes and focus goes back.
    const file = page.getByRole('button', { name: 'File', exact: true });
    await file.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /Export/ })).toContainText('step 5.9b');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(file).toBeFocused();

    // Dialog: the import summary is a native modal dialog; the background is inert, Esc cancels and nothing is imported.
    await chooseFile(page, generatedFile('tiny', 'dense'));
    const dialog = page.getByRole('dialog', { name: 'Import summary' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('list', { name: 'Records per kind' })).toBeVisible();
    const inertBackground = await page.evaluate(() => {
      const outside = document.querySelector<HTMLElement>('header button');
      outside?.focus();
      return document.activeElement === outside;
    });
    expect(inertBackground, 'the background must not take focus while the dialog is open').toBe(false);
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => {
        const open = document.querySelector('dialog[open]');
        const active = document.activeElement;
        return active === document.body || (open !== null && active !== null && open.contains(active));
      });
      expect(inside, 'Tab never leaves the dialog for the page behind it').toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();

    // Toast: the import result is announced in the polite live region; Dismiss removes it. A clean toast is not an alert.
    await loadDemo(page);
    const live = page.getByRole('status', { name: 'Notifications' });
    await expect(live).toHaveAttribute('aria-live', 'polite');
    await expect(live).toContainText('Imported');
    await live.getByRole('button', { name: 'Dismiss' }).click();
    await expect(live).not.toContainText('Imported');

    // Banner: a second tab is read-only and says so in the banner region, with a word for its kind.
    const other = await context.newPage();
    await openApp(other);
    const notices = other.getByRole('region', { name: 'Notices' });
    await expect(notices).toContainText('This tab is read-only because another tab of this app is the writer');
    await expect(notices).toContainText('Notice');
    await other.close();
    await expectClean(seen);
  });

  test('the focus ring is 2 px and keyboard focus reaches the controls', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Tab');
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement as Element);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(ring).toEqual({ width: '2px', style: 'solid' });
  });

  test('hit targets are at least 24 px', async ({ page }) => {
    await openApp(page);
    // The inspector starts closed (step 5.5a review, item g), so its button reads "Show inspector" at every size.
    for (const name of ['Load demo dataset', 'Import a file', 'Start empty', 'File', 'Show inspector']) {
      const size = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(size?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(24);
      expect(size?.width ?? 0, `${name} width`).toBeGreaterThanOrEqual(24);
    }
  });

  test('hit targets are at least 44 px on a touch device', async ({ browser }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 600, height: 900 }, baseURL: 'http://127.0.0.1:4173' });
    const page = await context.newPage();
    await openApp(page);
    for (const name of ['Load demo dataset', 'Import a file', 'Start empty', 'File', 'Show inspector']) {
      const size = await page.getByRole('button', { name, exact: true }).boundingBox();
      expect(size?.height ?? 0, `${name} height`).toBeGreaterThanOrEqual(44);
    }
    await context.close();
  });

  test('prefers-reduced-motion turns the motion durations to zero', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://127.0.0.1:4173' });
    const page = await context.newPage();
    await openApp(page);
    const value = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion-fast').trim());
    expect(value).toBe('0ms');
    await context.close();
  });
});

test.describe('panels survive a reload', () => {
  test('the inspector width, its open state and "Start empty" come back', async ({ page }) => {
    const seen = await watch(page);
    await page.setViewportSize({ width: 1400, height: 900 });
    await openApp(page);
    await page.getByRole('button', { name: 'Show inspector' }).click();
    const handle = page.getByRole('separator', { name: 'Resize inspector' });
    await expect(handle).toHaveAttribute('aria-valuenow', '400');
    await handle.focus();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowLeft');
    await expect(handle).toHaveAttribute('aria-valuenow', '448');
    for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowLeft'); // stops at the maximum
    await expect(handle).toHaveAttribute('aria-valuenow', '520');
    await page.keyboard.press('Home');
    await expect(handle).toHaveAttribute('aria-valuenow', '360');
    await page.keyboard.press('ArrowLeft');
    await expect(handle).toHaveAttribute('aria-valuenow', '376');
    await page.getByRole('button', { name: 'Start empty' }).click();
    await showDataset(page);
    await page.waitForTimeout(800); // the debounce (300 ms) and the write

    await page.reload();
    await showDataset(page);
    await expect(page.getByRole('region', { name: 'First run' })).toHaveCount(0);
    await expect(page.getByRole('separator', { name: 'Resize inspector' })).toHaveAttribute('aria-valuenow', '376');
    const wide = await box(page, 'aside');
    expect(Math.round(wide.width)).toBeGreaterThanOrEqual(376);

    await page.getByRole('button', { name: 'Hide inspector' }).click();
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCount(0);
    await page.waitForTimeout(800);
    await page.reload();
    await showDataset(page);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show inspector' })).toBeVisible();
    await expectClean(seen);
  });
});

test.describe('the three breakpoints', () => {
  test('1280 px and wider: three panes, the inspector is a pane with a resize handle', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await page.getByRole('button', { name: 'Show inspector' }).click();
    const rail = await box(page, 'nav[aria-label="Modes"]');
    const canvas = await box(page, 'main');
    const inspector = await box(page, 'aside');
    expect(rail.x).toBeLessThan(canvas.x);
    expect(canvas.x + canvas.width).toBeLessThanOrEqual(inspector.x + 1);
    expect(Math.round(inspector.width)).toBe(400);
    await expect(page.getByRole('separator', { name: 'Resize inspector' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Inspector empty state' })).toBeVisible();
  });

  test('900 to 1279 px: the inspector is an overlay drawer, closed until asked, covering the canvas edge', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await openApp(page);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCount(0);
    await expect(page.getByRole('separator')).toHaveCount(0);
    const canvasBefore = await box(page, 'main');
    await page.getByRole('button', { name: 'Show inspector' }).click();
    const drawer = await box(page, 'aside');
    const canvasAfter = await box(page, 'main');
    expect(canvasAfter.width).toBe(canvasBefore.width); // an overlay: the canvas does not shrink
    expect(Math.round(drawer.x + drawer.width)).toBe(1100);
    expect(await page.locator('aside').evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    // Esc closes the TOPMOST layer only: the tooltip that keyboard focus opens goes first, then the drawer.
    await page.getByRole('button', { name: 'Close inspector' }).focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCount(0);
  });

  test('below 900 px: one pane, the mode rail is a bottom bar and the inspector a bottom sheet', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await openApp(page);
    const rail = await box(page, 'nav[aria-label="Modes"]');
    const canvas = await box(page, 'main');
    expect(rail.y).toBeGreaterThan(canvas.y + canvas.height - 1);
    expect(Math.round(canvas.width)).toBe(600);
    await page.getByRole('button', { name: 'Show inspector' }).click();
    const sheet = await box(page, 'aside');
    expect(Math.round(sheet.width)).toBe(600);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(rail.y + 1);
    expect(await page.locator('body').evaluate((b) => b.scrollWidth <= window.innerWidth)).toBe(true); // no horizontal page scroll
    await expect(page.getByRole('button', { name: /Reactions/ })).toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('a damaged uiState entry', () => {
  test('is reset and reported, never fatal: the app boots with the defaults and says so', async ({ page }) => {
    const seen = await watch(page);
    await openApp(page);
    // The page writes its own damage: the real database, the real key, a value of the wrong shape (a tool a user could not use is not needed:
    // an older or newer version, or a bad write, would leave exactly this behind).
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('orn');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('uiState', 'readwrite');
            tx.objectStore('uiState').put({ key: 'panels', value: { inspectorWidth: 'enormous', inspectorOpen: 'perhaps', later: 1 } });
            tx.oncomplete = () => (db.close(), resolve());
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    // the damaged open state is reset to its default: closed
    await expect(page.getByRole('separator', { name: 'Resize inspector' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Show inspector' }).click();
    await expect(page.getByRole('separator', { name: 'Resize inspector' })).toHaveAttribute('aria-valuenow', '400');
    await expect(page.getByRole('region', { name: 'Panel layout' })).toContainText('damaged and was reset (inspectorWidth, inspectorOpen)');
    await expectClean(seen);
  });
});
