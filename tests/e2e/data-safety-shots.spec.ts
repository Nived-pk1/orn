/**
 * The screenshots of step 8.4s that need a picture dataset, a clock, or a damaged database (Studio PRODUCTION build, Chromium only; the
 * words themselves are unit-tested, the engines are covered by data-safety.spec.ts):
 *  S3: a dataset with a picture opens the export on Package and "In the package"; "No images" says "1 picture is NOT in this file."
 *  S4: after a backup and 4 days with one change, the notice "1 change is not in a backup." with its "Back up now" button.
 *  S6: a database where most rows do not fit this version opens read-only with the words and nothing changed.
 *  L1: while the map canvas chunk is slow (a delayed response), the map shows its loading line, then the map.
 * Screenshots: screenshots/8.4s/ (git-ignored).
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, openApp, watch, type UploadFile } from './kit';
import { canonicalInput, editorDialog, openDemo, openNamesEditor, pane, record, showRecord, showSpecies } from './editor-kit';
import { makePng } from './png-kit';

test.use({ actionTimeout: 60_000 });
test.skip(({ browserName }) => browserName !== 'chromium', 'screenshots only; the engines run data-safety.spec.ts');

const SHOTS = resolve(process.cwd(), 'screenshots', '8.4s');
const shot = (name: string): string => {
  mkdirSync(SHOTS, { recursive: true });
  return resolve(SHOTS, name);
};
const fileMenu = async (page: Page) => page.getByRole('button', { name: 'File', exact: true }).click();
const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Export your data' });
async function openExport(page: Page): Promise<void> {
  await fileMenu(page);
  await page.getByRole('menuitem', { name: /Export\.\.\./ }).click();
  await expect(exportDialog(page).getByRole('group', { name: 'What to include' })).toBeVisible();
}

const SN2 = 'SN2 substitution of a haloalkane';
const SN2_ID = 'mec_sn2-haloalkane';
const png: UploadFile = { name: 'my-sketch.png', mimeType: 'image/png', buffer: makePng(96, 64) };

test('S3: with a picture the export opens on the package; "No images" says how many pictures are not in the file', async ({ page }) => {
  test.setTimeout(240_000);
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDemo(page);
  await showRecord(page, 'm', SN2, SN2_ID);
  await pane(page).getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = editorDialog(page, SN2);
  await editor.getByRole('button', { name: 'Add picture', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add picture' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), add.getByLabel('Picture file').click()]);
  await chooser.setFiles(png);
  await add.getByLabel('Alt text (required)').fill('A sketch of the backside attack');
  await add.getByRole('button', { name: 'Add picture', exact: true }).click();
  await expect(add).toBeHidden({ timeout: 60_000 });
  await editor.getByRole('button', { name: 'Close (keeps the draft)', exact: true }).click();

  await openExport(page);
  const dialog = exportDialog(page);
  await expect(dialog.getByRole('radio', { name: /Package \(\.ornpkg\)/ })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: /In the package/ })).toBeChecked();
  await page.screenshot({ path: shot('export-defaults-with-pictures-1280x800.png') });

  await dialog.getByRole('radio', { name: /No images/ }).check();
  await expect(dialog.getByText('1 picture is NOT in this file.')).toBeVisible();
  await dialog.getByText('1 picture is NOT in this file.').scrollIntoViewIfNeeded();
  await page.screenshot({ path: shot('export-no-images-words-1280x800.png') });
  await expectClean(seen);
});

test('S4: after a backup and 4 days with one change, the notice offers a backup', async ({ page }) => {
  test.setTimeout(240_000);
  await page.clock.install({ time: new Date('2026-11-15T10:00:00Z') });
  const seen = await watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDemo(page);
  await openExport(page);
  const [download] = await Promise.all([page.waitForEvent('download'), exportDialog(page).getByRole('button', { name: 'Export', exact: true }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.orn\.json$/);
  await page.getByRole('dialog', { name: 'Export finished' }).getByRole('button', { name: 'Close', exact: true }).last().click();

  await page.clock.fastForward(4 * 24 * 3600 * 1000);
  await showSpecies(page, 'spc_ethanol', 'ethanol');
  await openNamesEditor(page, 'Ethanol');
  await canonicalInput(page).fill('Ethanol one');
  await editorDialog(page, 'Ethanol').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(record(page).getByRole('heading', { level: 3, name: 'Ethanol one' })).toBeVisible();
  // 8.4f C3 (the old look of this step changes, the behaviour tested stays): the backup notice comes BEFORE the storage warning, so it is shown at
  // once and the storage warning is the "+1 more" behind it (before, the owner had to dismiss the storage warning to reach the backup notice)
  const notice = page.getByText('1 change is not in a backup.');
  await expect(notice).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '+1 more' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back up now' })).toBeVisible();
  await page.screenshot({ path: shot('backup-notice-1280x800.png') });
  await expectClean(seen);
});

test('S6: most rows do not fit this version: read-only, the words, nothing moved', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Status details' })).toContainText('Saved');
  const added = await page.evaluate(
    () =>
      new Promise<number>((done, fail) => {
        const open = indexedDB.open('orn');
        open.onerror = () => fail(new Error('open failed'));
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('records', 'readwrite');
          const store = tx.objectStore('records');
          const all = store.getAll();
          all.onsuccess = () => {
            const species = (all.result as { id: string; kind: string }[]).find((row) => row.kind === 'species');
            if (species === undefined) return fail(new Error('no species row'));
            for (let n = 0; n < 30; n += 1) store.put({ ...species, id: `spc_bad-${n}`, unexpectedField: n });
          };
          tx.oncomplete = () => {
            db.close();
            done(30);
          };
          tx.onerror = () => fail(new Error('write failed'));
        };
      }),
  );
  expect(added).toBe(30);
  await page.reload();
  // 8.4f C2: the words, no code, no "Get started" block
  await expect(page.getByText(/30 of \d+ saved records do not fit this version of the app\. Nothing was changed or deleted\. Reload the page to get the newest version\./).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/integrity_failure/)).toHaveCount(0);
  await expect(page.getByText('Get started')).toHaveCount(0);
  await expect(page.getByText(/Use the writer tab/)).toHaveCount(0);
  await page.screenshot({ path: shot('boot-read-only-1280x800.png') });
  mkdirSync(resolve(process.cwd(), 'screenshots', 'compare-8.4f', 'part2'), { recursive: true });
  await page.screenshot({ path: resolve(process.cwd(), 'screenshots', 'compare-8.4f', 'part2', 'read-only-boot.png') });
});

test('L1: while the map canvas chunk is slow, the map shows its loading line, then the map', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/assets/navigator-canvas-*.js', async (route) => {
    await new Promise((release) => setTimeout(release, 6_000)); // a throttled network: the chunk arrives late
    await route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page); // not openDemo or loadDemo: they wait for the map, and this test is about the moment before it
  await page.getByRole('button', { name: 'Load demo dataset' }).click();
  const loading = page.getByRole('status', { name: 'Loading the navigator' });
  await expect(loading).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: shot('map-loading-fallback-1280x800.png') });
  await expect(page.getByRole('group', { name: /^Navigator: \d+ hubs?, \d+ arrows?$/ })).toBeVisible({ timeout: 60_000 });
  await expect(loading).toBeHidden();
});
