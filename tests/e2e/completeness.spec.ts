/**
 * Navigator completeness (step 5.5d, Part 2), Chromium against the PRODUCTION build and the real workers, the demo in 1280 x 800:
 * the Unanchored panel lists every unanchored reaction (ADV-014 UI part) and a click selects one; a warm layout after a reload is read
 * from `derivedCache` (no layout call reaches the worker); the dismissed storage warning stays dismissed after a reload and the status
 * line keeps "Storage: not persistent"; axe on the panel; zero CSP violations.
 */
import { expect, test, type Page } from '@playwright/test';
import { axeProblems, expectClean, loadDemo, openApp, watch } from './kit';

const NAVIGATOR = /^Navigator: \d+ hubs?, \d+ arrows?$/;
const drawing = (page: Page) => page.getByRole('group', { name: NAVIGATOR });

async function openDemo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await loadDemo(page);
  await expect(drawing(page)).toBeVisible();
}

/** Counts the `layout` requests a page sends to any worker, per page load (the script runs again after a reload). */
async function countLayoutCalls(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __layoutCalls: number };
    w.__layoutCalls = 0;
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      const data = args[0] as { type?: string; method?: string } | undefined;
      if (data?.type === 'request' && data.method === 'layout') w.__layoutCalls += 1;
      return (original as (...a: unknown[]) => void).apply(this, args);
    } as typeof Worker.prototype.postMessage;
  });
}
const layoutCalls = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { __layoutCalls: number }).__layoutCalls);

/** How many layouts are stored in `derivedCache` (read straight from IndexedDB). */
const storedLayouts = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('orn');
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('derivedCache')) return resolve(0);
          const all = db.transaction('derivedCache', 'readonly').objectStore('derivedCache').getAll();
          all.onsuccess = () => {
            db.close();
            resolve((all.result as { cacheKind?: string }[]).filter((row) => row.cacheKind === 'layout').length);
          };
          all.onerror = () => resolve(0);
        };
      }),
  );

test.describe('the Unanchored panel', () => {
  test('lists every unanchored reaction of the demo, a click selects one; axe; zero CSP violations', async ({ page }) => {
    const seen = await watch(page);
    await openDemo(page);
    const button = page.getByRole('button', { name: /^Unanchored reactions \(\d+\)$/ });
    await expect(button).toBeVisible();
    const total = Number(/\((\d+)\)/.exec((await button.textContent()) ?? '')?.[1]);
    expect(total, 'the demo has reactions no family holds (their arrows end on Unclassified)').toBeGreaterThan(0);
    await button.click();
    const panel = page.getByRole('region', { name: 'Unanchored reactions' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 2 })).toHaveText(`${total} ${total === 1 ? 'reaction is' : 'reactions are'} not in any family`);
    const rows = panel.getByRole('listitem');
    await expect(rows.first()).toHaveAttribute('aria-setsize', String(total));
    // scroll through the virtualised list and collect every id: none is left out
    const ids = await panel.locator('[data-virtual-list]').evaluate(async (scroller) => {
      const seenIds = new Set<string>();
      for (let top = 0; top <= scroller.scrollHeight + scroller.clientHeight; top += Math.max(40, scroller.clientHeight / 2)) {
        scroller.scrollTop = top;
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        for (const el of scroller.querySelectorAll('[data-reaction-id]')) seenIds.add(el.getAttribute('data-reaction-id') as string);
      }
      return [...seenIds];
    });
    expect(ids).toHaveLength(total);
    const first = panel.locator('[data-reaction-id]').first();
    expect(await axeProblems(page)).toEqual([]);
    await panel.locator('[data-virtual-list]').evaluate((scroller) => void (scroller.scrollTop = 0));
    await first.click();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(/^Selected: reaction /)).toBeVisible();
    await panel.getByRole('button', { name: 'Close' }).click();
    await expect(panel).toHaveCount(0);
    await expectClean(seen);
  });
});

test.describe('a warm layout after a reload', () => {
  test('the second load reads the layout from the cache: no layout call reaches the worker', async ({ page }) => {
    await countLayoutCalls(page);
    await openDemo(page);
    await expect(page.locator('[data-layout-engine]')).toHaveAttribute('data-layout-engine', 'grid');
    expect(await layoutCalls(page), 'the first load asks the worker').toBeGreaterThan(0);
    await expect.poll(() => storedLayouts(page), { timeout: 15_000 }).toBeGreaterThan(0);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Status' })).toBeVisible();
    await expect(drawing(page)).toBeVisible();
    await expect(page.locator('[data-layout-engine]')).toHaveAttribute('data-layout-engine', 'grid');
    expect(await layoutCalls(page), 'the second load does not').toBe(0);
  });
});

test.describe('the storage warning', () => {
  test('can be dismissed; it stays dismissed after a reload and the status line keeps "Storage: not persistent"', async ({ page }) => {
    // headless Chromium does not grant persistent storage; make the answer certain
    await page.addInitScript(() => {
      const storage = navigator.storage;
      Object.defineProperty(storage, 'persist', { configurable: true, value: () => Promise.resolve(false) });
      Object.defineProperty(storage, 'persisted', { configurable: true, value: () => Promise.resolve(false) });
    });
    const seen = await watch(page);
    await openDemo(page);
    const notices = page.getByRole('region', { name: 'Notices' });
    await expect(notices.getByText(/did not grant persistent storage/)).toBeVisible();
    await notices.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByText(/did not grant persistent storage/)).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Status' }).getByText('Storage: not persistent')).toBeVisible();
    // the choice is written to uiState (debounced)
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<unknown>((resolve) => {
                const open = indexedDB.open('orn');
                open.onsuccess = () => {
                  const get = open.result.transaction('uiState', 'readonly').objectStore('uiState').get('panels');
                  get.onsuccess = () => resolve((get.result as { value?: { storageNoticeDismissed?: boolean } } | undefined)?.value?.storageNoticeDismissed);
                };
              }),
          ),
        { timeout: 10_000 },
      )
      .toBe(true);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Status' }).getByText('Storage: not persistent')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/not grant persistent storage|not made this storage persistent/)).toHaveCount(0);
    await expect(notices.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
    await expectClean(seen);
  });
});
