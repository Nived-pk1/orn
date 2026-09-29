import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

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
      // Targets: src/core >= 90% lines, >= 85% branches; src/persistence, src/io >= 80% lines (services, TEST_STRATEGY §1).
      // Enforced by npm run test:coverage only, not by npm run check.
      coverage: {
        provider: 'v8',
        thresholds: { 'src/core/**': { lines: 90, branches: 85 }, 'src/persistence/**': { lines: 80 }, 'src/io/**': { lines: 80 } },
      },
    },
  }),
);
