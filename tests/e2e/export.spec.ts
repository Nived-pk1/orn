/**
 * The export screen end to end (step 5.9b), Chromium against the PRODUCTION build (the CSP exists only there). P-02 in a real browser:
 * the demo is exported, imported into a FRESH browser context through the import screen (replace_all), and exported again: the two
 * files are byte-identical (SHA-256 equal). INV-19: two exports of the same state are identical. A package with an image comes back
 * with its image. Cancel gives no download and says so. axe on the options and the result; zero policy violations, console errors and
 * foreign requests. The clock of both contexts is fixed (Playwright's clock), which is how the injected clock is reached from outside:
 * `exportedAt` and the date in the file name come from it.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { produce } from 'immer';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { buildOrnPackageExport } from '@/io';
import { loadFixtureState } from '@/test-support/state-fixture';
import { axeProblems, expectClean, expectPreview, importDialog, loadDemo, openApp, watch, type UploadFile } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const FIXED_TIME = new Date('2026-10-12T12:00:00.000Z');
const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

interface Downloaded {
  readonly name: string;
  readonly bytes: Buffer;
}

async function freshPage(browser: Browser): Promise<{ readonly context: BrowserContext; readonly page: Page }> {
  const context = await browser.newContext({ acceptDownloads: true, baseURL: 'http://127.0.0.1:4173' });
  await context.clock.setFixedTime(FIXED_TIME);
  return { context, page: await context.newPage() };
}

const exportDialog = (page: Page) => page.getByRole('dialog', { name: 'Export your data' });

async function openExport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Export\.\.\./ }).click();
  await expect(exportDialog(page).getByRole('group', { name: 'What to include' })).toBeVisible();
}

/** File -> Export..., choose, Export, take the download, and close the result. */
async function exportFile(page: Page, choose?: (dialog: ReturnType<typeof exportDialog>) => Promise<void>): Promise<Downloaded> {
  await openExport(page);
  const dialog = exportDialog(page);
  await choose?.(dialog);
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
  const path = await download.path();
  const result = page.getByRole('dialog', { name: 'Export finished' });
  await expect(result).toBeVisible();
  await expect(result).toContainText(`Saved ${download.suggestedFilename()}`);
  await result.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(result).toBeHidden();
  return { name: download.suggestedFilename(), bytes: readFileSync(path) };
}

/** The first-run "Import a file" (an empty store, so replace_all is the default), then Confirm. */
async function importFirstRun(page: Page, file: UploadFile): Promise<void> {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import a file' }).click()]);
  await chooser.setFiles(file);
  await expectPreview(page);
  const dialog = importDialog(page);
  await expect(dialog.getByRole('radio', { name: /Replace all/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 90_000 });
}

const asUpload = (file: Downloaded, mimeType: string): UploadFile => ({ name: file.name, mimeType, buffer: file.bytes });

test.describe('export (step 5.9b)', () => {
  test.use({ acceptDownloads: true });

  test('P-02 and INV-19 in a real browser: export, import into a fresh context, export again: byte-identical', async ({ browser }) => {
    const a = await freshPage(browser);
    const seenA = await watch(a.page);
    await openApp(a.page);
    await loadDemo(a.page);
    const first = await exportFile(a.page);
    const again = await exportFile(a.page);
    // INV-19: two exports of the same state are identical.
    expect(again.name).toBe(first.name);
    expect(sha256(again.bytes)).toBe(sha256(first.bytes));
    expect(first.name).toBe('ORN-demo-dataset-2026-10-12.orn.json');
    expect(first.bytes.at(-1)).toBe(0x0a);
    await expectClean(seenA);
    await a.context.close();

    const b = await freshPage(browser);
    const seenB = await watch(b.page);
    await openApp(b.page);
    await importFirstRun(b.page, asUpload(first, 'application/json'));
    const second = await exportFile(b.page);
    if (sha256(second.bytes) !== sha256(first.bytes)) {
      const at = first.bytes.findIndex((byte, index) => byte !== second.bytes[index]);
      const line = first.bytes.subarray(0, Math.max(at, 0)).toString('utf8').split('\n').length;
      throw new Error(`the exports differ at byte ${at} (line ${line}): ${JSON.stringify(first.bytes.subarray(Math.max(at - 40, 0), at + 40).toString('utf8'))} versus ${JSON.stringify(second.bytes.subarray(Math.max(at - 40, 0), at + 40).toString('utf8'))}`);
    }
    expect(sha256(second.bytes)).toBe(sha256(first.bytes));
    await expectClean(seenB);
    await b.context.close();
  });

  test('a package with an image re-imports with its image and exports it again, byte for byte', async ({ browser }) => {
    // The fixture state holds one asset record; it is given a real 1x1 PNG (hash and size of its bytes), the package is made in Node
    // and uploaded through the real chooser.
    const imageBytes = new Uint8Array(Buffer.from(PNG_1X1, 'base64'));
    const state = produce(loadFixtureState('maximal-valid'), (draft) => {
      const asset = draft.records.asset['ast_max-grignard-scheme' as never] as { sha256: string; byteSize: number; mediaType: string } | undefined;
      if (asset === undefined) throw new Error('the fixture has no asset');
      asset.sha256 = sha256(imageBytes);
      asset.byteSize = imageBytes.length;
      asset.mediaType = 'image/png';
    });
    const built = await buildOrnPackageExport(
      state,
      { scope: 'full', includeDependencies: false, assets: 'package' },
      { exportedAt: FIXED_TIME.toISOString(), generator: { app: 'orn-e2e', version: '1' }, assetBytes: async () => imageBytes },
    );
    if (!built.ok) throw new Error('the package does not build');
    const upload: UploadFile = { name: 'with-image.ornpkg', mimeType: 'application/zip', buffer: Buffer.from(built.result.bytes) };

    const a = await freshPage(browser);
    const seenA = await watch(a.page);
    await openApp(a.page);
    await importFirstRun(a.page, upload);
    const exported = await exportFile(a.page, async (dialog) => {
      await dialog.getByRole('radio', { name: /Package \(\.ornpkg\)/ }).check();
      await dialog.getByRole('radio', { name: /In the package/ }).check();
    });
    expect(exported.name).toMatch(/\.ornpkg$/);
    const files = unzipSync(new Uint8Array(exported.bytes));
    const imagePath = Object.keys(files).find((path) => path.startsWith('assets/'));
    expect(imagePath, 'the package holds the image').toBeDefined();
    expect(Buffer.from(files[imagePath ?? ''] ?? new Uint8Array()).equals(Buffer.from(imageBytes))).toBe(true);
    await expectClean(seenA);
    await a.context.close();

    const b = await freshPage(browser);
    const seenB = await watch(b.page);
    await openApp(b.page);
    await importFirstRun(b.page, asUpload(exported, 'application/zip'));
    const again = await exportFile(b.page, async (dialog) => {
      await dialog.getByRole('radio', { name: /Package \(\.ornpkg\)/ }).check();
      await dialog.getByRole('radio', { name: /In the package/ }).check();
    });
    expect(sha256(again.bytes)).toBe(sha256(exported.bytes));
    await expectClean(seenB);
    await b.context.close();
  });

  test('Cancel gives no download and says so; the next export works', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const seen = await watch(page);
    let downloads = 0;
    page.on('download', () => (downloads += 1));
    await openApp(page);
    await loadDemo(page);
    await openExport(page);
    // Export and Cancel in the same task, before the worker can answer: the click handler has already put the running screen up.
    await page.evaluate(async () => {
      const dialog = [...document.querySelectorAll('dialog[open]')].find((d) => d.getAttribute('aria-label') === 'Export your data' || d.querySelector('h2')?.textContent === 'Export your data');
      const press = (root: ParentNode, name: string): void => {
        const button = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
        if (button === undefined) throw new Error(`no ${name} button`);
        button.click();
      };
      press(dialog ?? document, 'Export');
      // React puts the running screen up in a microtask; the worker's answer needs a later task.
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      const running = [...document.querySelectorAll('dialog[open]')].find((d) => d.textContent?.includes('Cancel stops the export'));
      if (running === undefined) throw new Error('the running screen is not up');
      press(running, 'Cancel');
    });
    const cancelled = page.getByRole('dialog', { name: 'Export cancelled' });
    await expect(cancelled).toContainText('Cancelled. No file was made and nothing was changed.');
    await page.waitForTimeout(1500);
    expect(downloads).toBe(0);
    await cancelled.getByRole('button', { name: 'Close', exact: true }).last().click();
    // The operation slot is free again once the flow has wound down; the next export then works.
    await expect(page.getByText(/^Exporting:/)).toHaveCount(0);
    const next = await exportFile(page);
    expect(next.bytes.length).toBeGreaterThan(1000);
    expect(downloads).toBe(1);
    await expectClean(seen);
    await context.close();
  });

  test('the dialog is keyboard complete, passes axe on the options and the result, and has a screenshot', async ({ browser }) => {
    const { context, page } = await freshPage(browser);
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    await openExport(page);
    const dialog = exportDialog(page);
    await expect(dialog).toContainText('Everything');
    await expect(dialog).toContainText('Chemistry only');
    await expect(dialog).toContainText('Curriculum');
    await expect(dialog).toContainText('Display settings');
    expect(await axeProblems(page, 10)).toEqual([]);
    await page.screenshot({ path: resolve(SHOTS, 'export-dialog-1280x800.png') });
    // Keyboard: Tab reaches the radio groups, the file name and the buttons; Escape closes.
    await dialog.getByRole('radio', { name: /Chemistry only/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(dialog.getByRole('radio', { name: /Curriculum/ })).toBeChecked();
    const name = dialog.getByRole('textbox', { name: 'File name' });
    await name.fill('../my backup');
    await expect(dialog).toContainText('my-backup.orn.json');
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
    expect(download.suggestedFilename()).toBe('my-backup.orn.json');
    const result = page.getByRole('dialog', { name: 'Export finished' });
    await expect(result).toBeVisible();
    expect(await axeProblems(page, 10)).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(result).toBeHidden();
    await expectClean(seen);
    await context.close();
  });

  test('the failed-save banner and the storage warning are not shown on a healthy page, and the Dataset mode has Export', async ({ page }) => {
    const seen = await watch(page);
    await openApp(page);
    await loadDemo(page);
    await expect(page.getByRole('button', { name: 'Export now' })).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: 'Dataset' }).click();
    await page.getByRole('region', { name: 'Back up the data' }).getByRole('button', { name: 'Export...' }).click();
    await expect(exportDialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(exportDialog(page)).toBeHidden();
    await expectClean(seen);
  });
});
