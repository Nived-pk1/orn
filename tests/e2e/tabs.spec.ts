/**
 * ADV-039 (browser half) and INV-28 (step 5.10a; the integration half is Gate C): two tabs of one browser profile. Tab 1 is the writer.
 * Tab 2 opens read-only and says so; an import in tab 1 appears in tab 2 without a reload; when tab 1 closes, tab 2 takes over as the
 * writer (the banner goes, Import is available), imports a file, and a reload shows that import. One writer at a time throughout: tab 2
 * never writes while tab 1 lives. Chromium, Firefox and WebKit (a persistent context in WebKit, see fixtures.ts).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import type { GeneratorShape } from '@/test-support/generator-shapes';
import { chooseFileViaMenu, expectClean, expectPreview, generatedFile, importDialog, loadDemo, openApp, showDataset, watch } from './kit';

const FOLLOWER = /This tab is read-only because another tab of this app is the writer/;

async function total(page: Page): Promise<number> {
  await showDataset(page);
  const items = await page.getByRole('list', { name: 'Record counts' }).getByRole('listitem').allTextContents();
  return items.reduce((sum, text) => sum + (Number(/: (\d+)$/.exec(text.trim())?.[1]) || 0), 0);
}

/** `replace`: "Replace all" (a file whose records share IDs with the data adds nothing when merged, so the second import replaces). */
async function importFile(page: Page, shape: GeneratorShape, replace = false): Promise<void> {
  await chooseFileViaMenu(page, generatedFile('initial', shape, 5));
  await expectPreview(page);
  if (replace) {
    // the choice runs the preview again, so the radio changes a moment later
    const radio = importDialog(page).getByRole('radio', { name: /Replace all/ });
    await radio.click();
    await expect(radio).toBeChecked({ timeout: 90_000 });
    await expectPreview(page);
  }
  await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /).last()).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible({ timeout: 120_000 });
}

test.describe('two tabs', () => {
  test('ADV-039 and INV-28: tab 2 is read-only and follows tab 1; closing tab 1 promotes tab 2, which can then import', async ({ makeContext }) => {
    test.setTimeout(480_000);
    const context = await makeContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 } });
    const tab1 = context.pages()[0] ?? (await context.newPage());
    const seen1 = await watch(tab1);
    await openApp(tab1);
    await loadDemo(tab1);
    await expect(tab1.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    const demoTotal = await total(tab1);
    await expect(tab1.getByText(FOLLOWER)).toHaveCount(0);

    // tab 2: read-only, and says so; it shows the data tab 1 saved
    const tab2 = await context.newPage();
    const seen2 = await watch(tab2);
    await openApp(tab2);
    await expect(tab2.getByText(FOLLOWER)).toBeVisible({ timeout: 60_000 });
    expect(await total(tab2)).toBe(demoTotal);
    await tab2.getByRole('button', { name: 'File' }).click();
    await expect(tab2.getByRole('menuitem', { name: /Import a file\.\.\./ })).toBeDisabled();
    await tab2.keyboard.press('Escape');

    // an import in tab 1 appears in tab 2, with no reload and no write by tab 2
    await importFile(tab1, 'hub_explosion');
    const afterFirst = await total(tab1);
    expect(afterFirst).toBeGreaterThan(demoTotal);
    await expect.poll(() => total(tab2), { timeout: 90_000 }).toBe(afterFirst);
    await expect(tab2.getByText(FOLLOWER)).toBeVisible();

    // closing tab 1 promotes tab 2: the banner goes and it can import; a reload shows that import
    await tab1.close();
    await expect(tab2.getByText(FOLLOWER)).toHaveCount(0, { timeout: 60_000 });
    await expect(tab2.getByText(/^Saved \(revision \d+\)$/)).toBeVisible({ timeout: 60_000 });
    await importFile(tab2, 'cyclic', true);
    const afterSecond = await total(tab2);
    expect(afterSecond, 'the second import changed the data').not.toBe(afterFirst);
    await tab2.reload();
    await expect(tab2.getByText(FOLLOWER)).toHaveCount(0);
    expect(await total(tab2)).toBe(afterSecond);
    await expectClean(seen2);
    expect(seen1.consoleErrors, 'tab 1 console errors').toEqual([]);
    expect(seen1.pageErrors, 'tab 1 page errors').toEqual([]);
    expect(seen1.foreignRequests).toEqual([]);
    await context.close();
  });
});
