import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (step 5.1d, notes E10, E15). They ALWAYS run against the PRODUCTION build served by `vite preview`: the
 * Content-Security-Policy exists only there. Not part of `npm run check`; run with `npm run e2e`. Since Gate E (step 5.10a) EVERY spec runs in
 * Chromium, Firefox and WebKit (a test that an engine cannot run is skipped there with its reason in the spec); WebKit runs in a persistent
 * context (tests/e2e/fixtures.ts says why).
 */
const PORT = 4173;
/** Release preview: set ORN_BASE_URL to run the specs against a site that is already up (wrangler dev, the live site); no server is started then. */
const REMOTE = process.env.ORN_BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { baseURL: REMOTE ?? `http://127.0.0.1:${PORT}`, trace: 'off', acceptDownloads: true },
  webServer: REMOTE !== undefined ? undefined : {
    // the existing specs test the editors and the study views: they run against the STUDIO build (dist-studio), studio step E6
    command: `node scripts/edition.mjs studio build && node scripts/edition.mjs studio preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
