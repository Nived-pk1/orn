/**
 * ADV-038, the browser half (step 5.10a; the integration half is Gate C): a write that is cut off is all or nothing. In a persistent
 * profile an import is started on top of the demo; the context is closed (in Chromium also: the renderer is killed) while the status
 * says "saving". The same profile is opened again: the record count is EXACTLY the count before the import or exactly the count after
 * it, never between, and nothing was moved to quarantine. A control run (the same import, left to finish) gives the two counts.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, BrowserContextOptions, Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { chooseFileViaMenu, expectClean, expectPreview, generatedFile, importDialog, loadDemo, openApp, showDataset, watch } from './kit';

const OPTIONS: BrowserContextOptions = { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 800 }, acceptDownloads: true };
const SAVING = /^Applied, not saved yet: saving \d+ changes?$/;

/** What the run saw, in the test annotations and in the log (the reporter list does not print annotations). */
function note(description: string): void {
  test.info().annotations.push({ type: 'observed', description });
  console.log(`OBSERVED ${description}`);
}

type Launch = (dir: string) => Promise<BrowserContext>;

/** The sum of the Dataset mode's record counts, and whether anything was moved to quarantine at this boot. */
async function counts(page: Page): Promise<{ readonly total: number; readonly quarantined: boolean }> {
  await showDataset(page);
  const items = await page.getByRole('list', { name: 'Record counts' }).getByRole('listitem').allTextContents();
  const total = items.reduce((sum, text) => sum + (Number(/: (\d+)$/.exec(text.trim())?.[1]) || 0), 0);
  const quarantined = (await page.getByText(/failed validation|quarantin|set aside/i).count()) > 0;
  return { total, quarantined };
}

async function startImport(page: Page): Promise<void> {
  await chooseFileViaMenu(page, generatedFile('initial', 'hub_explosion', 7));
  await expectPreview(page);
  await importDialog(page).getByRole('button', { name: 'Confirm' }).click();
}

test.describe('a cut-off write is all or nothing', () => {
  test('ADV-038: closing the context while the status says saving leaves the count before or after the import, nothing quarantined', async ({ playwright, browserName }) => {
    test.setTimeout(480_000);
    const launch: Launch = (dir) => playwright[browserName].launchPersistentContext(dir, OPTIONS);
    const dirs: string[] = [];
    const profile = async (): Promise<string> => {
      const dir = await mkdtemp(join(tmpdir(), `orn-${browserName}-`));
      dirs.push(dir);
      return dir;
    };
    try {
      // control run: the numbers before and after the import
      const control = await launch(await profile());
      const controlPage = control.pages()[0] ?? (await control.newPage());
      await openApp(controlPage);
      await loadDemo(controlPage);
      await expect(controlPage.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
      const before = (await counts(controlPage)).total;
      await startImport(controlPage);
      await expect(controlPage.getByText(/^Imported \d+ records from /)).toBeVisible({ timeout: 120_000 });
      await expect(controlPage.getByText(/^Saved \(revision \d+\)$/)).toBeVisible({ timeout: 120_000 });
      const after = (await counts(controlPage)).total;
      await control.close();
      expect(after).toBeGreaterThan(before);

      // the cut-off run
      const dir = await profile();
      const first = await launch(dir);
      const page = first.pages()[0] ?? (await first.newPage());
      await openApp(page);
      await loadDemo(page);
      await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
      expect((await counts(page)).total).toBe(before);
      await startImport(page);
      let sawSaving = true;
      await expect(page.getByText(SAVING)).toBeVisible({ timeout: 120_000 }).catch(() => {
        sawSaving = false;
      });
      note(`${browserName}: the status said "saving" when the context was closed: ${sawSaving}`);
      await first.close();

      const reopened = await launch(dir);
      const again = reopened.pages()[0] ?? (await reopened.newPage());
      const seen = await watch(again);
      await openApp(again);
      const result = await counts(again);
      note(`${browserName}: before ${before}, after ${after}, found ${result.total}`);
      expect([before, after], `the count found (${result.total}) is the one before or the one after`).toContain(result.total);
      expect(result.quarantined, 'nothing was quarantined').toBe(false);
      await expectClean(seen);
      await reopened.close();
    } finally {
      for (const dir of dirs) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test('ADV-038 (Chromium): a renderer killed while the status says saving leaves the count before or after the import', async ({ playwright, browserName }) => {
    test.skip(browserName !== 'chromium', 'chrome://crash exists only in Chromium (Playwright cannot kill a Firefox or WebKit content process)');
    test.setTimeout(480_000);
    const dirs: string[] = [];
    const profile = async (): Promise<string> => {
      const dir = await mkdtemp(join(tmpdir(), 'orn-crash-'));
      dirs.push(dir);
      return dir;
    };
    try {
      const control = await playwright.chromium.launchPersistentContext(await profile(), OPTIONS);
      const controlPage = control.pages()[0] ?? (await control.newPage());
      await openApp(controlPage);
      await loadDemo(controlPage);
      await expect(controlPage.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
      const before = (await counts(controlPage)).total;
      await startImport(controlPage);
      await expect(controlPage.getByText(/^Saved \(revision \d+\)$/)).toBeVisible({ timeout: 120_000 });
      const after = (await counts(controlPage)).total;
      await control.close();

      const context = await playwright.chromium.launchPersistentContext(await profile(), OPTIONS);
      const page = context.pages()[0] ?? (await context.newPage());
      await openApp(page);
      await loadDemo(page);
      await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
      await startImport(page);
      let sawSaving = true;
      await expect(page.getByText(SAVING)).toBeVisible({ timeout: 120_000 }).catch(() => {
        sawSaving = false;
      });
      const crashed = page.waitForEvent('crash');
      await page.goto('chrome://crash').catch(() => undefined);
      await crashed;
      note(`chromium: the status said "saving" when the renderer was killed: ${sawSaving}`);

      const next = await context.newPage();
      const seen = await watch(next);
      await openApp(next);
      const result = await counts(next);
      note(`chromium crash: before ${before}, after ${after}, found ${result.total}`);
      expect([before, after], `the count found (${result.total}) is the one before or the one after`).toContain(result.total);
      expect(result.quarantined, 'nothing was quarantined').toBe(false);
      await expectClean(seen);
      await context.close();
    } finally {
      for (const dir of dirs) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
