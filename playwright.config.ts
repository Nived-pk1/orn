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
/** ORN_REUSE_SERVERS=1: the preview servers are already up (started by hand, stopped by PID); the config only checks that they answer. */
const REUSE = process.env.ORN_REUSE_SERVERS === '1';
/**
 * Step T (T1.1): the specs run in parallel (workers: ORN_E2E_WORKERS, default 3) EXCEPT the ones that measure time or frames, which run alone with one
 * worker in the "<engine>-serial" projects, and the one-time screenshot runs for a review, which run only on demand in the "review" project.
 * `npm run e2e` (scripts/run-e2e.mjs) runs the parallel projects first, then the serial ones: a serial project never shares the machine with another test.
 * Each test still has its own context (WebKit: a pooled one that is emptied between tests, tests/e2e/fixtures.ts), so no test depends on another.
 */
const WORKERS = Number(process.env.ORN_E2E_WORKERS ?? '3');
const SERIAL_SPECS = ['**/fluid-feel.spec.ts', '**/map-motion.spec.ts', '**/apply-progress.spec.ts', '**/lifecycle.spec.ts', '**/durability.spec.ts', '**/layout-guard.spec.ts', '**/navigator.spec.ts', '**/depiction-surface.spec.ts'];
const REVIEW_SPECS = ['**/compare-*.spec.ts', '**/step-t-shots.spec.ts', '**/step-8-5-shots.spec.ts', '**/step-8-5b-shots.spec.ts', '**/step-8-5c-shots.spec.ts', '**/step-8-5g-shots.spec.ts', '**/step-8-5gb-shots.spec.ts', '**/step-8-5h-shots.spec.ts'];
/** The Gate D authoring spec belongs to the project "gate-d" alone. */
const GATE_D_SPEC = '**/author-demo-all.spec.ts';

const FIXTURE_DIR = 'test-results/e2e-published';
const studyEnv = { ORN_PUBLISH_DIR: FIXTURE_DIR, ORN_PUBLISHED_DIR: FIXTURE_DIR, ORN_OUT_DIR: 'dist-study-e2e', ORN_NOW: '2026-10-21T09:30:00.000Z' };

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: WORKERS,
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
            reuseExistingServer: REUSE,
            timeout: 300_000,
          },
          {
            command: `node scripts/publish-dataset.mjs data/fixtures/schema/v2/minimal-valid.orn.json --allow-unreviewed 22 && node scripts/edition.mjs study build && node scripts/edition.mjs study preview --host 127.0.0.1 --port ${STUDY_PORT} --strictPort`,
            url: `http://127.0.0.1:${STUDY_PORT}`,
            reuseExistingServer: REUSE,
            timeout: 300_000,
            env: studyEnv,
          },
        ],
  projects: [
    // the parallel projects (the names the specs and the docs have always used)
    { name: 'chromium', testIgnore: [GATE_D_SPEC, ...SERIAL_SPECS, ...REVIEW_SPECS], use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: [GATE_D_SPEC, ...SERIAL_SPECS, ...REVIEW_SPECS], use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: [GATE_D_SPEC, ...SERIAL_SPECS, ...REVIEW_SPECS], use: { ...devices['Desktop Safari'] } },
    // the timing-sensitive specs, alone, one at a time
    { name: 'chromium-serial', testMatch: SERIAL_SPECS, fullyParallel: false, workers: 1, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox-serial', testMatch: SERIAL_SPECS, fullyParallel: false, workers: 1, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit-serial', testMatch: SERIAL_SPECS, fullyParallel: false, workers: 1, use: { ...devices['Desktop Safari'] } },
    // the screenshot runs of a review (compare-*): on demand, `playwright test --project=review`; not regression tests, not deleted
    { name: 'review', testMatch: REVIEW_SPECS, fullyParallel: false, workers: 1, use: { ...devices['Desktop Chrome'] } },
    // Gate D (step 6.9): all 27 demo reactions authored from scratch, Chromium only; present only when `npm run e2e:gate-d` asks for it
    ...(process.env.ORN_GATE_D === undefined ? [] : [{ name: 'gate-d', testMatch: GATE_D_SPEC, use: { ...devices['Desktop Chrome'] } }]),
  ],
});
