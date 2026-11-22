/**
 * The `test` of the e2e specs. Chromium and Firefox use Playwright's ordinary context (a new one per test). WebKit needs a PERSISTENT context
 * (`launchPersistentContext`): Playwright's ordinary WebKit context keeps nothing on disk and behaves like a Safari private window, where IndexedDB
 * refuses to store a Blob (the `pre_import` snapshot, PERSISTENCE §6), so every import fails with SNAPSHOT_FAILED (step 5.1d). Since step 5.10a boot
 * probes that and opens such a window session-only (tests/e2e/private-window.spec.ts).
 *
 * Step T (T1.2): launching a WebKit process and a profile folder for EVERY test was most of WebKit's wall time. A WORKER now keeps one persistent
 * context per distinct set of context options (a pool) and hands it to each test in turn. Between two tests the context is made empty again, so no test
 * sees another's data: every page is closed and a fresh blank one is opened, routes, cookies and permissions are cleared, and the origin's storage is
 * wiped (every IndexedDB database, the caches, the service workers; the app keeps nothing in local or session storage, CLAUDE.md §3) from a blank page of that origin. A context whose wipe does not complete is
 * thrown away and the next test gets a new one. `makeContext` (more profiles inside one test) still launches its own.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, type BrowserContext, type BrowserContextOptions, type BrowserType } from '@playwright/test';

interface Pooled {
  readonly context: BrowserContext;
  readonly dir: string;
  readonly origin: string | undefined;
}

interface WebkitPool {
  /** The pooled context for these options (made on first use); the test must hand it back with `release`. */
  acquire(options: BrowserContextOptions): Promise<BrowserContext>;
  /** Empties the context for the next test; false (and the context is closed) when that did not work. */
  release(context: BrowserContext): Promise<void>;
}

const WIPE_MS = 15_000;

/** Every client-side store of the origin of the blank page this runs in. Resolves to a short report; rejects on a blocked delete. */
async function wipeOrigin(): Promise<void> {
  const databases = (await indexedDB.databases?.()) ?? [];
  await Promise.all(
    databases.map(
      (info) =>
        new Promise<void>((resolve, reject) => {
          if (info.name === undefined) return resolve();
          const request = indexedDB.deleteDatabase(info.name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(new Error(`cannot delete ${info.name}`));
        }),
    ),
  );
  for (const key of await caches.keys()) await caches.delete(key);
  for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
}

function webkitPool(playwright: { webkit: BrowserType }): { pool: WebkitPool; closeAll: () => Promise<void> } {
  const open = new Map<string, Pooled>();
  const byContext = new Map<BrowserContext, string>();
  const drop = async (key: string): Promise<void> => {
    const entry = open.get(key);
    if (entry === undefined) return;
    open.delete(key);
    byContext.delete(entry.context);
    await entry.context.close().catch(() => undefined);
    await rm(entry.dir, { recursive: true, force: true }).catch(() => undefined);
  };
  const pool: WebkitPool = {
    async acquire(options) {
      const key = JSON.stringify(options);
      const found = open.get(key);
      if (found !== undefined) return found.context;
      const dir = await mkdtemp(join(tmpdir(), 'orn-webkit-'));
      const context = await playwright.webkit.launchPersistentContext(dir, options);
      open.set(key, { context, dir, origin: options.baseURL });
      byContext.set(context, key);
      return context;
    },
    async release(context) {
      const key = byContext.get(context);
      if (key === undefined) return;
      const entry = open.get(key) as Pooled;
      try {
        const blank = await context.newPage();
        for (const page of context.pages()) if (page !== blank) await page.close({ runBeforeUnload: false }).catch(() => undefined);
        await context.unrouteAll({ behavior: 'ignoreErrors' });
        await context.clearCookies();
        await context.clearPermissions();
        if (entry.origin !== undefined) {
          const wiper = await context.newPage();
          // robots.txt is a plain file of the origin: a document there has the origin's storage and does not start the app
          await wiper.goto(new URL('/robots.txt', entry.origin).toString());
          await Promise.race([wiper.evaluate(wipeOrigin), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('wipe timed out')), WIPE_MS))]);
          await wiper.close({ runBeforeUnload: false });
        }
      } catch {
        await drop(key);
      }
    },
  };
  return {
    pool,
    closeAll: async () => {
      for (const key of [...open.keys()]) await drop(key);
    },
  };
}

export const test = base.extend<{ makeContext: (options?: BrowserContextOptions) => Promise<BrowserContext>; freshWebkit: boolean }, { webkitPool: WebkitPool }>({
  /** A spec about what the browser has cached or what its pointer did (a blocked .wasm, the font responses, a hover) sets this: WebKit then gets its own context, as before the pool. */
  freshWebkit: [false, { option: true }],
  webkitPool: [
    async ({ playwright }, provide) => {
      const { pool, closeAll } = webkitPool(playwright);
      await provide(pool);
      await closeAll();
    },
    { scope: 'worker' },
  ],
  context: async ({ browserName, browser, baseURL, viewport, userAgent, deviceScaleFactor, acceptDownloads, hasTouch, isMobile, webkitPool: pool, freshWebkit, playwright }, provide) => {
    const options = {
      ...(baseURL === undefined ? {} : { baseURL }),
      viewport,
      ...(userAgent === undefined ? {} : { userAgent }),
      ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
      acceptDownloads,
      ...(hasTouch ? { hasTouch } : {}),
      ...(isMobile === true && browserName !== 'firefox' ? { isMobile } : {}),
    };
    if (browserName !== 'webkit') {
      const ordinary = await browser.newContext(options);
      await provide(ordinary);
      await ordinary.close();
      return;
    }
    if (freshWebkit) {
      const dir = await mkdtemp(join(tmpdir(), 'orn-webkit-'));
      const own = await playwright.webkit.launchPersistentContext(dir, options);
      try {
        await provide(own);
      } finally {
        await own.close().catch(() => undefined);
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
      return;
    }
    const persistent = await pool.acquire(options);
    try {
      await provide(persistent);
    } finally {
      await pool.release(persistent);
    }
  },
  /** Step 5.10a: more contexts that can keep data (a second profile, another origin): ordinary in Chromium and Firefox, persistent in WebKit. */
  makeContext: async ({ playwright, browserName, browser }, provide) => {
    const open: { context: BrowserContext; dir?: string }[] = [];
    await provide(async (options: BrowserContextOptions = {}) => {
      if (browserName !== 'webkit') {
        const context = await browser.newContext(options);
        open.push({ context });
        return context;
      }
      const dir = await mkdtemp(join(tmpdir(), 'orn-webkit-'));
      const context = await playwright.webkit.launchPersistentContext(dir, options);
      open.push({ context, dir });
      return context;
    });
    for (const { context, dir } of open) {
      await context.close().catch(() => undefined);
      if (dir !== undefined) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },
  page: async ({ context }, provide) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await provide(page);
  },
});

export { expect } from '@playwright/test';
