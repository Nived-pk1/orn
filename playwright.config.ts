import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (step 5.1d, notes E10, E15). They ALWAYS run against the PRODUCTION build served by `vite preview`: the
 * Content-Security-Policy exists only there. Not part of `npm run check`; run with `npm run e2e`. Since Gate E (step 5.10a) EVERY spec runs in
 * Chromium, Firefox and WebKit (a test that an engine cannot run is skipped there with its reason in the spec); WebKit runs in a persistent
 * context (tests/e2e/fixtures.ts says why).
 *
 * Two editions (studio step E6, ADR-041), two preview servers: every spec but one tests the editors and the study views and runs against the
 * STUDIO build (`dist-studio`, port 4173); `study-edition.spec.ts` runs against the STUDY build (`dist-study-e2e`, port 4174), built over a
 * published-dataset fixture that the server command makes with the real `publish:dataset` script from a small committed dataset.
 */
const STUDIO_PORT = 4173;
const STUDY_PORT = 4174;
/** Release preview: set ORN_BASE_URL to run the specs against a site that is already up (wrangler dev, the live site); no server is started then. */
const REMOTE = process.env.ORN_BASE_URL;

const FIXTURE_DIR = 'test-results/e2e-published';
const studyEnv = { ORN_PUBLISH_DIR: FIXTURE_DIR, ORN_PUBLISHED_DIR: FIXTURE_DIR, ORN_OUT_DIR: 'dist-study-e2e', ORN_NOW: '2026-10-21T09:30:00.000Z' };

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { baseURL: REMOTE ?? `http://127.0.0.1:${STUDIO_PORT}`, trace: 'off', acceptDownloads: true },
  webServer:
    REMOTE !== undefined
      ? undefined
      : [
          {
            command: `node scripts/edition.mjs studio build && node scripts/edition.mjs studio preview --host 127.0.0.1 --port ${STUDIO_PORT} --strictPort`,
            url: `http://127.0.0.1:${STUDIO_PORT}`,
            reuseExistingServer: false,
            timeout: 300_000,
          },
          {
            command: `node scripts/publish-dataset.mjs data/fixtures/schema/v2/minimal-valid.orn.json && node scripts/edition.mjs study build && node scripts/edition.mjs study preview --host 127.0.0.1 --port ${STUDY_PORT} --strictPort`,
            url: `http://127.0.0.1:${STUDY_PORT}`,
            reuseExistingServer: false,
            timeout: 300_000,
            env: studyEnv,
          },
        ],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
