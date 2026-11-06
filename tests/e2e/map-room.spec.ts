/**
 * More room for the map (step 8.3b, Part A and B2.2), the STUDIO build: one toolbar row, the Key popover, the hint and the selection INSIDE the
 * map, box text size at 1280 x 800 and 1920 x 1000 (the demo and the user-like own-data fixture), the selection label with its clear button, and
 * a second click that keeps an arrow selected. Screenshots go to screenshots/.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, leaveChapters, loadDemo, watch } from './kit';
import { shotsDir } from './editor-kit';
import { boxTitlePx } from './box-text';
import { closeKey, cornerLabel, openKey, selectionLine } from './map-toolbar-kit';
import { focusFamily } from './map-focus-kit';
import { NAVIGATOR, openMapDesktop } from './map-layout-kit';

const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });

async function openDemoAt(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await loadDemo(page);
  await leaveChapters(page);
  await expect(drawing(page)).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(900);
}

test.describe('the measuring helper', () => {
  test('boxTitlePx reads a known 12 px label as 12', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const holder = document.createElement('div');
      holder.innerHTML = '<svg width="200" height="40"><g id="calibration"><text font-size="12" x="4" y="20">Known</text></g></svg>';
      document.body.append(holder);
    });
    expect(await boxTitlePx(page, '#calibration text')).toBeCloseTo(12, 5);
  });
});

test.describe('more room for the map (Studio)', () => {
  test.use({ actionTimeout: 60_000 });

  test('1280 x 800, the demo: ONE toolbar row, no row of hints above the map, box titles at least 12 px', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemoAt(page, 1280, 800);
    const toolbar = page.getByRole('toolbar', { name: 'Canvas tools' });
    const bar = await toolbar.boundingBox();
    const map = await drawing(page).boundingBox();
    if (bar === null || map === null) throw new Error('no boxes');
    expect(bar.height, 'one row of buttons').toBeLessThanOrEqual(60);
    expect(map.y - (bar.y + bar.height), 'the map starts right under the toolbar: no legend row, no hint row, no selection line').toBeLessThanOrEqual(2);
    const px = await boxTitlePx(page);
    console.log(`demo 1280x800 Studio: box title ${px.toFixed(2)} px`);
    expect(px).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: `${shotsDir()}/map-room-studio-demo-1280x800.png` });
    await expectClean(seen);
  });

  test('1920 x 1000, the demo: box titles at least 13 px', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemoAt(page, 1920, 1000);
    const px = await boxTitlePx(page);
    console.log(`demo 1920x1000 Studio: box title ${px.toFixed(2)} px`);
    expect(px).toBeGreaterThanOrEqual(13);
    await expectClean(seen);
  });

  test('1920 x 1000, the user-like fixture: box titles at least 13 px; screenshot', async ({ page }) => {
    test.setTimeout(400_000);
    const seen = await watch(page);
    await openMapDesktop(page);
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.getByRole('button', { name: 'Fit' }).click();
    await page.waitForTimeout(900);
    const px = await boxTitlePx(page);
    console.log(`fixture 1920x1000 Studio: box title ${px.toFixed(2)} px`);
    expect(px).toBeGreaterThanOrEqual(13);
    await page.screenshot({ path: `${shotsDir()}/map-room-studio-1920x1000.png` });
    await expectClean(seen);
  });

  test('the Key popover holds the legend, closes with Esc and returns the focus to the Key button', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemoAt(page, 1280, 800);
    await expect(page.getByRole('list', { name: 'Family groups' })).toHaveCount(0); // not a row above the map
    const popover = await openKey(page);
    await expect(popover.getByRole('list', { name: 'Family groups' })).toBeVisible();
    await page.screenshot({ path: `${shotsDir()}/map-key-open-1280x800.png` });
    await closeKey(page);
    await expect(page.getByRole('button', { name: 'Key' })).toBeFocused();
    await expectClean(seen);
  });

  test('a focused family shows the small key INSIDE the map, two lines at most, and the hint gives way to the selection', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemoAt(page, 1280, 800);
    await expect(page.locator('[data-map-quiet]')).toBeVisible(); // the hint is inside the map's top-left corner
    const hint = await page.locator('[data-map-corner]').boundingBox();
    const area = await drawing(page).boundingBox();
    if (hint === null || area === null) throw new Error('no boxes');
    expect(hint.x).toBeGreaterThanOrEqual(area.x);
    expect(hint.y).toBeGreaterThanOrEqual(area.y);
    const before = await drawing(page).boundingBox();
    await focusFamily(page, 'cls_alcohols');
    await expect(page.locator('[data-map-selected]')).toHaveText('Selected: Alcohols');
    expect(await drawing(page).boundingBox(), 'nothing moved when the selection label appeared').toEqual(before);
    const key = page.getByRole('list', { name: 'What the arrows mean' });
    await expect(key).toBeVisible();
    const keyBox = await key.boundingBox();
    if (keyBox === null) throw new Error('no key box');
    expect(keyBox.height).toBeLessThanOrEqual(64);
    await page.screenshot({ path: `${shotsDir()}/map-focus-key-1280x800.png` });
    await expectClean(seen);
  });

  test('the selection label has a clear button; Esc clears too; closing the pane keeps the selection; a second click keeps an arrow selected', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await openDemoAt(page, 1280, 800);
    await focusFamily(page, 'cls_alcohols');
    await expect(cornerLabel(page)).toContainText('Selected: Alcohols');
    await expect(selectionLine(page)).toHaveText(/^Selected: Alcohols/); // the live region stays for screen readers
    await cornerLabel(page).getByRole('button', { name: 'Clear the selection' }).click();
    await expect(page.locator('[data-map-selected]')).toHaveCount(0);
    await expect(selectionLine(page)).toHaveText('Nothing is selected.');
    // an arrow: select it, close the pane, the label stays; a second click on the same arrow keeps it selected
    await focusFamily(page, 'cls_alcohols');
    const arrow = page.locator('svg [data-layer="edges"] [data-edge-id]').first();
    await arrow.click({ force: true });
    await expect(page.locator('[data-map-selected]')).toContainText('→');
    const hide = page.getByRole('button', { name: 'Hide inspector' });
    if ((await hide.count()) > 0) await hide.click();
    await expect(page.locator('[data-map-selected]')).toContainText('→'); // closing the pane does not change the selection
    await page.screenshot({ path: `${shotsDir()}/map-selected-label-1280x800.png` });
    await arrow.click({ force: true });
    await expect(page.locator('[data-map-selected]')).toContainText('→'); // a second click does not toggle it off (a double click opens the family page)
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-map-selected]')).toHaveCount(0);
    await expect(selectionLine(page)).toHaveText('Nothing is selected.');
    await expectClean(seen);
  });
});
