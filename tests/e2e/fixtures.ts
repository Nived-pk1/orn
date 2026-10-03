/**
 * The `test` of the smoke spec. Chromium and Firefox use Playwright's ordinary context. WebKit uses a PERSISTENT context
 * (`launchPersistentContext`): Playwright's ordinary WebKit context keeps nothing on disk and behaves like a Safari private window,
 * where IndexedDB refuses to store a Blob (the `pre_import` snapshot, PERSISTENCE §6), so every import fails with SNAPSHOT_FAILED
 * (step 5.1d; an open item for step 5.10a decides what the product does in such a window).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as base } from '@playwright/test';

export const test = base.extend({
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
  page: async ({ context }, provide) => {
    const page = context.pages()[0] ?? (await context.newPage());
    await provide(page);
  },
});

export { expect } from '@playwright/test';
