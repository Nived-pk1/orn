import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (step 5.1d, notes E10, E15). They ALWAYS run against the PRODUCTION build served by `vite preview`: the
 * Content-Security-Policy exists only there. Not part of `npm run check`; run with `npm run e2e`. The full suite runs in Chromium; the
 * two-spec smoke (smoke.spec.ts) also runs in Firefox and WebKit until Gate E (step 5.10a); WebKit runs in a persistent context (tests/e2e/fixtures.ts says why).
 */
const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'off', acceptDownloads: true },
  webServer: {
    command: `npx vite build && npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 300_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: ['**/smoke.spec.ts', '**/private-window.spec.ts', '**/csp.spec.ts'], use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: ['**/smoke.spec.ts', '**/private-window.spec.ts', '**/csp.spec.ts'], use: { ...devices['Desktop Safari'] } },
  ],
});
