import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.{ts,tsx}'],
      exclude: ['tests/e2e/**', 'node_modules/**'],
      // UI tests opt into a DOM per file with `// @vitest-environment jsdom` (jsdom is added in Phase 5).
      environment: 'node',
      benchmark: { include: ['tests/perf/**/*.bench.ts'] },
      restoreMocks: true,
    },
  }),
);
