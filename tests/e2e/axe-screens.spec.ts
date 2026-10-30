/**
 * Gate E, accessibility on every screen (step 5.10a), in Chromium, Firefox and WebKit against the PRODUCTION build: axe at WCAG 2.2 AA
 * finds nothing serious or critical on the first-run screen, the overview, the List view, the Unanchored panel, a family page, the
 * inspector with each of its levels opened, the palette (results and commands), the import preview, an import refusal, the export options
 * and the export result; and on the overview, a family page and the inspector at 700 px wide. Zero policy violations, console errors,
 * dialogs and foreign requests.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, chooseFileViaMenu, expectClean, expectPreview, importDialog, loadDemo, openApp, watch, type UploadFile, exampleCard } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const record = (page: Page) => page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const clean = async (page: Page, where: string) => expect(await axeProblems(page, 10), `axe at ${where}`).toEqual([]);
const BAD_FILE: UploadFile = { name: 'not-json.json', mimeType: 'application/json', buffer: Buffer.from('this is not json', 'utf8') };

async function openFamily(page: Page): Promise<void> {
  await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
  await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
}

test.describe('axe on every screen', () => {
  test('first run, overview, List view, Unanchored, family page, inspector levels, palette, import, export (1280 x 800)', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    await clean(page, 'the first-run screen');

    await loadDemo(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await clean(page, 'the overview');

    const list = page.getByRole('toolbar', { name: 'Canvas tools' }).getByRole('button', { name: 'List' });
    await list.click();
    await expect(page.getByRole('table', { name: /families/i }).first()).toBeVisible();
    await clean(page, 'the List view');
    await list.click(); // the same button toggles back to the map
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await page.getByRole('button', { name: /^Unanchored reactions \(\d+\)$/ }).click();
    await expect(page.getByRole('region', { name: 'Unanchored reactions' })).toBeVisible();
    await clean(page, 'the Unanchored panel');
    await page.getByRole('button', { name: /^Unanchored reactions \(\d+\)$/ }).click();

    await page.locator('svg [data-node-id="cls_alcohols"]').click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'cls_alcohols');
    await openFamily(page);
    await clean(page, 'a family page');

    await page.getByRole('button', { name: /^Aldehydes\s*2\s*reactions$/ }).click();
    const card = await exampleCard(page, 'Ethanol → ethanal (PCC)'); // folded under the general oxidation (7.3a C1)
    await card.getByRole('button', { name: 'Ethanol → ethanal (PCC)' }).click();
    await expect(record(page)).toHaveAttribute('data-record-id', 'rxn_ethanol-to-ethanal-pcc');
    await clean(page, 'the inspector, as it opens');
    for (const level of [1, 2, 3, 4, 5]) {
      const button = record(page).getByRole('button', { name: new RegExp(`Level ${level}`) });
      if ((await button.count()) > 0 && (await button.getAttribute('aria-expanded')) === 'false') await button.click();
      await clean(page, `the inspector, level ${level} open`);
    }

    await page.keyboard.press('Control+K');
    await palette(page).getByRole('combobox').fill('ethanol');
    await expect(palette(page).getByRole('status')).not.toHaveText('Search is starting');
    await expect(palette(page).getByRole('option').first()).toBeVisible();
    await clean(page, 'the palette, results');
    await palette(page).getByRole('combobox').fill('>');
    await expect(palette(page).getByRole('option').first()).toBeVisible();
    await clean(page, 'the palette, commands');
    await page.keyboard.press('Escape');

    await chooseFileViaMenu(page, { name: 'demo.orn.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(await demoJson()), 'utf8') });
    await expectPreview(page);
    await clean(page, 'the import preview');
    await importDialog(page).getByRole('button', { name: 'Cancel' }).click();

    await chooseFileViaMenu(page, BAD_FILE);
    const refusal = page.getByRole('dialog', { name: 'The file was not imported' });
    await expect(refusal).toBeVisible({ timeout: 60_000 });
    await clean(page, 'an import refusal');
    await refusal.getByRole('button', { name: 'Dismiss' }).click();

    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /Export\.\.\./ }).click();
    const exporter = page.getByRole('dialog', { name: 'Export your data' });
    await expect(exporter).toBeVisible();
    await clean(page, 'the export options');
    const [download] = await Promise.all([page.waitForEvent('download'), exporter.getByRole('button', { name: /^Export$/ }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.orn\.json$/);
    await expect(page.getByRole('dialog', { name: 'Export finished' })).toBeVisible();
    await clean(page, 'the export result');
    await expectClean(seen);
  });

  test('the overview, a family page and the inspector at 700 px wide', async ({ page }) => {
    test.setTimeout(240_000);
    const seen = await watch(page);
    await page.setViewportSize({ width: 700, height: 800 });
    await openApp(page);
    await loadDemo(page);
    await expect(page.getByRole('group', { name: NAVIGATOR })).toBeVisible();
    await clean(page, 'the overview at 700 px');
    await openFamily(page);
    await clean(page, 'a family page at 700 px');
    const show = page.getByRole('button', { name: 'Show inspector' });
    if ((await show.count()) > 0) await show.click();
    await expect(record(page)).toBeVisible();
    await clean(page, 'the inspector at 700 px');
    for (const level of [1, 2, 3, 4, 5]) {
      const button = record(page).getByRole('button', { name: new RegExp(`Level ${level}`) });
      if ((await button.count()) > 0 && (await button.getAttribute('aria-expanded')) === 'false') await button.click();
    }
    await clean(page, 'the inspector at 700 px, every level open');
    // Observed, not asserted (the step asks for axe at 700 px): how wide the page is when the inspector is open.
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: window.innerWidth }));
    console.log(`OBSERVED width at 700 px with the inspector open: page ${widths.page}, window ${widths.window}`);
    await expectClean(seen);
  });
});

/** The bundled demo, as the import screen's own preview wants it (any valid dataset file does). */
async function demoJson(): Promise<unknown> {
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  return JSON.parse(readFileSync(resolve(process.cwd(), 'data/seed/demo.orn.json'), 'utf8'));
}
