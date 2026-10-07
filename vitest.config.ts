import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Resource limit, not an assertion: Vitest's default (one worker per core) lets heavy tests time out under load on the
 * reference workstation, so `npm run check` runs at most 4 workers. Override with ORN_TEST_WORKERS (docs/TEST_STRATEGY.md §1).
 */
function testWorkers(): number {
  const raw = process.env.ORN_TEST_WORKERS;
  if (raw === undefined || raw === '') return 4;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`ORN_TEST_WORKERS must be a positive integer, got "${raw}"`);
  return n;
}

/**
 * Test files that start a real worker_threads thread (the *-threads files and the crash-recovery file). They run as their own serial
 * project, after the rest of the suite, so they never compete with it for the CPU (a resource arrangement, not an assertion change;
 * docs/TEST_STRATEGY.md §1).
 */
const REAL_THREAD_FILES = ['tests/integration/*-threads.test.ts', 'tests/integration/worker-crash-recovery.test.ts'];
const ALL_TESTS = ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'];
// tests/timing holds the wall-clock budget assertions: `npm run test:timing` only (docs/TEST_STRATEGY.md §1).
const EXCLUDED = ['tests/e2e/**', 'tests/timing/**', 'node_modules/**'];

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // UI tests opt into a DOM per file with `// @vitest-environment jsdom` (jsdom is added in Phase 5).
      environment: 'node',
      benchmark: { include: ['tests/perf/**/*.bench.ts'] },
      restoreMocks: true,
      maxWorkers: testWorkers(),
      // File order must not depend on an earlier run: no results cache (Vitest would otherwise run last time's failures first).
      cache: false,
      projects: [
        { extends: true, test: { name: 'main', include: ALL_TESTS, exclude: [...EXCLUDED, ...REAL_THREAD_FILES] } },
        { extends: true, test: { name: 'real-threads', include: REAL_THREAD_FILES, exclude: EXCLUDED, fileParallelism: false, maxWorkers: 1, sequence: { groupOrder: 1 } } },
      ],
      // Targets: src/core >= 90% lines, >= 85% branches; src/persistence, src/io, src/workers, src/chem, src/layout, src/search >= 80% lines (services, TEST_STRATEGY §1; the last three from step 4.6), src/app/services >= 80% lines (step 5.1a).
      // Enforced by npm run test:coverage only, not by npm run check.
      coverage: {
        provider: 'v8',
        thresholds: { 'src/core/**': { lines: 90, branches: 85 }, 'src/persistence/**': { lines: 80 }, 'src/io/**': { lines: 80 }, 'src/workers/**': { lines: 80 }, 'src/chem/**': { lines: 80 }, 'src/layout/**': { lines: 80 }, 'src/search/**': { lines: 80 }, 'src/app/services/**': { lines: 80 }, 'src/render/scene/**': { lines: 80 }, 'src/render/svg/**': { lines: 80 } },
      },
    },
  }),
);
