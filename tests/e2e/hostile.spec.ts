/**
 * ADV-033 in a real browser (step 5.10a): ONE hostile file made in Node (tests/e2e/support/hostile-file.ts) walks the whole product.
 * Names and notes full of <script>, <img onerror=...>, mini-markup and HTML tags; a reference with a javascript: URL (quarantined at
 * import, the preview says why in words); an SVG asset holding a script; a hostile file name. The import preview, the apply, the overview,
 * the family page, the inspector Levels 1 to 5, the palette and an export are walked: everything is text, the SVG asset is only an
 * <img src="blob:...">, nothing appears that the app did not render, and no dialog opens (the watch fails on one).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { axeProblems, expectClean, expectPreview, importDialog, inertProblems, openApp, watch, exampleCard } from './kit';
import { ASSET_ID, HOSTILE_FILE_NAME, HOSTILE_REACTION, HOSTILE_REF_TITLE, HOSTILE_SPECIES, HOSTILE_WORD, REACTION_ID, REF_ID, SCRIPT_TEXT, hostileFile } from './support/hostile-file';

const SHOTS = resolve(process.cwd(), 'screenshots');
const record = (page: Page) => page.getByRole('complementary', { name: 'Inspector' }).getByRole('article', { name: 'Record' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Opens every level of the open record that has a button, then asserts the page is still inert. */
async function openLevels(page: Page, where: string): Promise<void> {
  for (const level of [1, 2, 3, 4, 5]) {
    const button = record(page).getByRole('button', { name: new RegExp(`Level ${level}`) });
    if ((await button.count()) > 0 && (await button.getAttribute('aria-expanded')) === 'false') await button.click();
    expect(await inertProblems(page), `inert at ${where}, level ${level}`).toEqual([]);
  }
}

test.describe('hostile data', () => {
  test('ADV-033: hostile names, notes, a javascript: URL, a scripted SVG and a hostile file name are only text or an inert image', async ({ page }) => {
    test.setTimeout(300_000);
    const seen = await watch(page);
    const { file, text } = await hostileFile();
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    const scriptsAtStart = await page.evaluate(() => document.scripts.length);
    const inert = async (where: string) => expect(await inertProblems(page), `inert at ${where}`).toEqual([]);

    // 1. the import preview
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
    await chooser.setFiles(file);
    await expectPreview(page);
    const dialog = importDialog(page);
    await expect(dialog).toContainText(HOSTILE_FILE_NAME.slice(0, 30));
    // the javascript: reference is set aside, and the preview says why in words
    await expect(dialog.getByText('Set aside, not imported (1)')).toBeVisible();
    await expect(dialog).toContainText(`reference ${REF_ID}: url: Only http(s) URLs are allowed`);
    await inert('the preview');
    expect(await dialog.locator('img, script, iframe').count()).toBe(0);
    expect(await axeProblems(page, 10)).toEqual([]);
    expect(text).toContain('javascript:window.__pwn=1');
    await dialog.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
    await inert('after the apply');

    // 2. the overview and the family page
    await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible();
    await inert('the overview');
    await page.locator('svg [data-node-id="cls_alcohols"]').dblclick();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    await page.getByRole('button', { name: /^Aldehydes\s*2\s*reactions$/ }).last().click();
    // the renamed reaction is the PCC example, folded under the general oxidation (7.3a C1): its card is inside the "Examples (1)" disclosure
    const card = await exampleCard(page, HOSTILE_REACTION);
    await expect(card).toBeVisible();
    await expect(card.getByRole('heading', { level: 5 }).first()).toHaveText(HOSTILE_REACTION);
    await inert('the family page');

    // 3. the inspector, every level
    await card.getByRole('button', { name: HOSTILE_REACTION }).click();
    await expect(record(page)).toHaveAttribute('data-record-id', REACTION_ID);
    await expect(record(page).getByRole('heading', { level: 3 }).first()).toHaveText(HOSTILE_REACTION);
    await openLevels(page, 'the reaction');
    await expect(record(page)).toContainText(SCRIPT_TEXT);
    expect(await axeProblems(page, 10)).toEqual([]);

    // 4. the scripted SVG: a record link in the notes opens the asset, which is only an <img> from a blob: URL
    await record(page).locator(`a[data-record-id="${ASSET_ID}"]`).first().click();
    await expect(record(page)).toHaveAttribute('data-record-id', ASSET_ID);
    const image = record(page).getByRole('img').first();
    await expect(image).toHaveAttribute('src', /^blob:/);
    await expect(image).toHaveAttribute('alt', new RegExp(`A hostile picture ${escaped(SCRIPT_TEXT)}`));
    await openLevels(page, 'the asset');
    await expect(page.locator('svg script, svg foreignObject, iframe')).toHaveCount(0);

    // 5. the palette: the hostile names are found and shown as text; the quarantined reference is not there
    await page.keyboard.press('Control+K');
    await palette(page).getByRole('combobox').fill(HOSTILE_WORD);
    await expect(palette(page).getByRole('status')).not.toHaveText('Search is starting');
    await expect(palette(page).locator(`[role="option"][data-record-id="${REACTION_ID}"]`)).toContainText(SCRIPT_TEXT);
    await expect(palette(page).locator('[role="option"][data-record-id="spc_ethanal"]')).toContainText(HOSTILE_SPECIES.slice(0, 24));
    await expect(palette(page).locator(`[role="option"][data-record-id="${REF_ID}"]`)).toHaveCount(0);
    await inert('the palette');
    expect(await axeProblems(page, 10)).toEqual([]);
    await page.keyboard.press('Escape');

    // 6. an export: the hostile strings are data in the file (as written), and the page stays inert
    await page.getByRole('button', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: /Export\.\.\./ }).click();
    const exporter = page.getByRole('dialog', { name: 'Export your data' });
    await expect(exporter).toBeVisible();
    await inert('the export options');
    const [download] = await Promise.all([page.waitForEvent('download'), exporter.getByRole('button', { name: /^Export$/ }).click()]);
    const exported = readFileSync((await download.path()) as string, 'utf8');
    expect(exported).toContain(HOSTILE_REACTION);
    expect(exported, 'the quarantined reference is not exported as a record').not.toContain(HOSTILE_REF_TITLE);
    await expect(page.getByRole('dialog', { name: 'Export finished' })).toBeVisible();
    await inert('the export result');

    expect(await page.evaluate(() => document.scripts.length), 'no script element was added').toBe(scriptsAtStart);
    await expectClean(seen);

    // The screenshot is last: in WebKit a screenshot makes the engine's own inspector inject a <style> that the page's policy reports
    // (event stack web-inspector://bootstrap.js), which would be counted above. The family page is behind the export result.
    await page.getByRole('dialog', { name: 'Export finished' }).getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(page.getByRole('region', { name: 'Family page: Alcohols' })).toBeVisible();
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: resolve(SHOTS, 'adv-033-family-page-1280x800.png') });
  });
});
