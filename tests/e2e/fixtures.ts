/**
 * The `test` of the smoke spec. Chromium and Firefox use Playwright's ordinary context. WebKit uses a PERSISTENT context
 * (`launchPersistentContext`): Playwright's ordinary WebKit context keeps nothing on disk and behaves like a Safari private window,
 * where IndexedDB refuses to store a Blob (the `pre_import` snapshot, PERSISTENCE §6), so every import fails with SNAPSHOT_FAILED
 * (step 5.1d). Since step 5.10a boot probes that and opens such a window session-only (tests/e2e/private-window.spec.ts).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base, type BrowserContext, type BrowserContextOptions } from '@playwright/test';

export const test = base.extend<{ makeContext: (options?: BrowserContextOptions) => Promise<BrowserContext> }>({
  context: async ({ playwright, browserName, browser, baseURL, viewport, userAgent, deviceScaleFactor, acceptDownloads }, provide) => {
    const options = {
      ...(baseURL === undefined ? {} : { baseURL }),
      viewport,
      ...(userAgent === undefined ? {} : { userAgent }),
      ...(deviceScaleFactor === undefined ? {} : { deviceScaleFactor }),
      acceptDownloads,
    };
    if (browserName !== 'webkit') {
      const ordinary = await browser.newContext(options);
      await provide(ordinary);
      await ordinary.close();
      return;
    }
    const dir = await mkdtemp(join(tmpdir(), 'orn-webkit-'));
    const persistent = await playwright.webkit.launchPersistentContext(dir, options);
    try {
      await provide(persistent);
    } finally {
      await persistent.close();
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
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
