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

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
      // tests/timing holds the wall-clock budget assertions: `npm run test:timing` only (docs/TEST_STRATEGY.md §1).
      exclude: ['tests/e2e/**', 'tests/timing/**', 'node_modules/**'],
      // UI tests opt into a DOM per file with `// @vitest-environment jsdom` (jsdom is added in Phase 5).
      environment: 'node',
      benchmark: { include: ['tests/perf/**/*.bench.ts'] },
      restoreMocks: true,
      maxWorkers: testWorkers(),
      // Targets: src/core >= 90% lines, >= 85% branches; src/persistence, src/io, src/workers >= 80% lines (services, TEST_STRATEGY §1).
      // Enforced by npm run test:coverage only, not by npm run check.
      coverage: {
        provider: 'v8',
        thresholds: { 'src/core/**': { lines: 90, branches: 85 }, 'src/persistence/**': { lines: 80 }, 'src/io/**': { lines: 80 }, 'src/workers/**': { lines: 80 } },
      },
    },
  }),
);
