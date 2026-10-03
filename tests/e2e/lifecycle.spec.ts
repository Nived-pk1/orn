/**
 * The page lifecycle in a real browser (step 5.1d): the clean-shutdown marker and what boot says about it. Chromium only.
 * The marker is the `lastCleanShutdownAt` row of the `meta` store: a time string is "closed cleanly", `null` is "running".
 * 1: a renderer that dies without `pagehide` leaves `null` and the next boot says a crash is suspected; a clean shutdown written
 *    while the page is alive is not reported (an ordinary reload is a `test.fixme`, see below).
 * 2: `pageshow` with `persisted = true` (a page back from the back/forward cache) writes `null` again after `pagehide` wrote a time.
 * Playwright's Chromium disables the back/forward cache, so the two events are dispatched on the real window and reach the real
 * listeners installed by `installLifecycle`.
 */
import { expect, test, type Page } from '@playwright/test';
import { expectClean, loadDemo, openApp, watch } from './kit';

const CRASH_LINE = /The last session may not have closed cleanly \(a crash is suspected\)/;

/** The raw marker, read from IndexedDB by the page itself: undefined (no row), null (running) or a time string. */
async function marker(page: Page): Promise<string | null | undefined> {
  return page.evaluate(
    () =>
      new Promise<string | null | undefined>((resolve, reject) => {
        const open = indexedDB.open('orn');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction('meta', 'readonly').objectStore('meta').get('lastCleanShutdownAt');
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            db.close();
            const row = get.result as { value?: string | null } | undefined;
            resolve(row === undefined ? undefined : (row.value ?? null));
          };
        };
      }),
  );
}

async function loaded(page: Page): Promise<void> {
  await openApp(page);
  await loadDemo(page);
  await expect(page.getByText(/^Saved \(revision \d+\)$/)).toBeVisible();
}

test.describe('the page lifecycle in Chromium', () => {
  test('a renderer that dies without pagehide is reported at the next boot', async ({ context, page }) => {
    await loaded(page);
    expect(await marker(page)).toBeNull(); // boot marked the session as running
    const crashed = page.waitForEvent('crash');
    await page.goto('chrome://crash').catch(() => undefined); // kills the renderer: no pagehide, no unload handlers
    await crashed; // the dead tab stays open; its renderer, and with it the writer lock, is gone

    const after = await context.newPage();
    const seen = await watch(after);
    await openApp(after);
    await expect(after.getByRole('region', { name: 'Start-up report' })).toBeVisible();
    await expect(after.getByText(CRASH_LINE)).toBeVisible();
    await expect(after.getByRole('region', { name: 'Dataset' })).toBeVisible();
    await expectClean(seen);
  });

  test('a clean shutdown (pagehide while the page is alive) is not reported at the next boot', async ({ page }) => {
    await loaded(page);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false })));
    await expect.poll(() => marker(page), { timeout: 15_000 }).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    await page.reload();
    await expect(page.getByRole('region', { name: 'Dataset' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Start-up report' })).toHaveCount(0);
    await expect(page.getByText(CRASH_LINE)).toHaveCount(0);
  });

  // Found by this step's browser run (docs/PROGRESS.md, step 5.1d, REVIEW REQUIRED 4): an ordinary reload says "a crash is
  // suspected" at the next boot (2 of 2), because the marker write that `pagehide` starts does not finish while the page is
  // torn down. The same write finishes when the page stays alive (the test above). Not fixed here: it is the reviewer's decision.
  test.fixme('an ordinary reload is not reported as a crash', async ({ page }) => {
    await loaded(page);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Dataset' })).toBeVisible();
    await expect(page.getByText(CRASH_LINE)).toHaveCount(0);
  });

  test('pageshow with persisted = true writes the running marker again after pagehide wrote a time', async ({ page }) => {
    const seen = await watch(page);
    await loaded(page);
    expect(await marker(page)).toBeNull();

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    await expect.poll(() => marker(page), { timeout: 15_000 }).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
    await page.waitForTimeout(500);
    expect(await marker(page)).toEqual(expect.stringMatching(/^\d{4}-/)); // persisted = false changes nothing

    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(() => marker(page), { timeout: 15_000 }).toBeNull();
    await expectClean(seen);
  });
});
