/**
 * A window that cannot keep data (step 5.10a, part 1). Playwright's ORDINARY WebKit context behaves like a Safari private window:
 * IndexedDB opens, but a Blob put is refused. Boot probes that with an aborted 1-byte Blob put and answers session-only with
 * `blob_storage_refused`: the banner says so, the app works in memory (Load demo, Undo import), an export downloads. The persistent
 * WebKit context, and the ordinary Chromium and Firefox contexts, stay writers. Production build, zero violations / errors / dialogs.
 */
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { expectClean, loadDemo, openApp, watch } from './kit';

const BANNER = 'This browser window cannot keep data (it may be a private window). The app works, but nothing is saved after you close it. Export a backup to keep your work.';
const ORDINARY = { acceptDownloads: true, baseURL: 'http://127.0.0.1:4173' } as const;

/** In a session-only window the toast says "Applied N records ..., not saved" instead of "Imported". */
async function loadDemoUnsaved(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Load demo dataset' }).click();
  await expect(page.getByText(/^Applied \d+ records from demo\.orn\.json, not saved/)).toBeVisible();
}

test.describe('windows that cannot keep data (step 5.10a)', () => {
  test('an ordinary WebKit context is session-only: the banner, Load demo, Undo import and an export all work', async ({ browser, browserName }) => {
    test.skip(browserName !== 'webkit', 'only the ordinary WebKit context refuses a Blob (PROGRESS, step 5.10a part 1 fact sheet)');
    const context = await browser.newContext(ORDINARY);
    const page = await context.newPage();
    const seen = await watch(page);
    await openApp(page);
    await expect(page.getByText(BANNER, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Saved \(revision/)).toHaveCount(0);

    await loadDemoUnsaved(page);
    await expect(page.getByRole('group', { name: /^Navigator: 16 hubs, \d+ arrows$/ })).toBeVisible();
    // Undo import works in memory: the data from before the import (none) is back.
    await page.getByRole('button', { name: 'Undo import' }).last().click();
    await expect(page.getByText(/Import undone: the data from before it is back\./).last()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByRole('region', { name: 'First run' })).toBeVisible();
    await loadDemoUnsaved(page);

    // The banner's own button opens the export screen, and the file downloads.
    await page.getByRole('button', { name: 'Export a backup' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export your data' });
    await expect(dialog).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Export', exact: true }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.orn\.json$/);
    const text = await readFile((await download.path()) as string, 'utf8');
    expect(text.length).toBeGreaterThan(10_000);
    expect(JSON.parse(text).format).toBeDefined();
    await expect(page.getByRole('dialog', { name: 'Export finished' })).toBeVisible();
    await expectClean(seen);
    await context.close();
  });

  test('the persistent WebKit context is a writer as before', async ({ playwright, browserName }) => {
    test.skip(browserName !== 'webkit', 'the persistent context matters only in WebKit; the other engines are covered by the next test');
    const dir = await mkdtemp(join(tmpdir(), 'orn-webkit-'));
    const context = await playwright.webkit.launchPersistentContext(dir, { ...ORDINARY });
    try {
      const page = context.pages()[0] ?? (await context.newPage());
      const seen = await watch(page);
      await openApp(page);
      await expect(page.getByText(BANNER, { exact: true })).toHaveCount(0);
      await loadDemo(page);
      await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
      await expectClean(seen);
    } finally {
      await context.close();
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test('an ordinary context in Chromium and Firefox is a writer: no banner, the data is saved', async ({ browser, browserName }) => {
    test.skip(browserName === 'webkit', 'the ordinary WebKit context is session-only: the first test');
    const context = await browser.newContext(ORDINARY);
    const page = await context.newPage();
    const seen = await watch(page);
    await openApp(page);
    await expect(page.getByText(BANNER, { exact: true })).toHaveCount(0);
    await loadDemo(page);
    await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    await expectClean(seen);
    await context.close();
  });
});
