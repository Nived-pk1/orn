/**
 * "N records set aside" in the status line (step 5.11b part 2), Chromium against the PRODUCTION build: rows planted in the quarantine
 * store (not moved by any boot, so the start-up report says nothing about them) are counted in the status line on every boot; a
 * dataset with none shows no such item. Zero policy violations, console errors and foreign requests.
 */
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { expectClean, loadDemo, openApp, watch } from './kit';

const SHOTS = resolve(process.cwd(), 'screenshots');
const status = (page: Page) => page.getByRole('region', { name: 'Status' });

/** Adds `count` quarantine rows straight to IndexedDB (the store boot and imports use), as an earlier session would have left them. */
const plant = (page: Page, count: number): Promise<void> =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolveRows, reject) => {
        const open = indexedDB.open('orn');
        open.onerror = () => reject(new Error('cannot open the database'));
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('quarantine', 'readwrite');
          for (let i = 0; i < n; i += 1) tx.objectStore('quarantine').put({ id: `q-e2e-${i}`, createdAt: '2026-10-01T00:00:00.000Z', source: 'boot_integrity', claimedKind: 'species', issues: ['planted by the e2e test'], raw: { id: 'spc_x', broken: true } });
          tx.oncomplete = () => {
            db.close();
            resolveRows();
          };
          tx.onerror = () => reject(new Error('cannot write the rows'));
        };
      }),
    count,
  );

test.describe('records set aside in the status line (5.11b)', () => {
  test('a planted quarantined row survives reloads and the status line shows it; none shows nothing', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough: the count is read by the same code everywhere (specified for Chromium)');
    const seen = await watch(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await openApp(page);
    await loadDemo(page);
    await expect(status(page).getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
    await expect(status(page).getByText(/set aside/)).toHaveCount(0);

    await plant(page, 1);
    await page.reload();
    await expect(status(page).getByText('1 record set aside')).toBeVisible();
    await page.reload();
    await expect(status(page).getByText('1 record set aside')).toBeVisible();
    // the rows were not moved by these boots: the start-up report has no quarantine line
    await expect(page.getByText(/failed validation and (was|were) set aside/)).toHaveCount(0);

    await plant(page, 3);
    await page.reload();
    await expect(status(page).getByText('3 records set aside')).toBeVisible();
    await page.screenshot({ path: resolve(SHOTS, 'status-records-set-aside-1280x800.png') });
    await expectClean(seen);
  });
});
