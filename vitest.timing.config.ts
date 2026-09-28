import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Wall-clock budget assertions only (`npm run test:timing`; docs/TEST_STRATEGY.md §1). They run at gates next to
 * `bench:baseline`, never in `npm run check` or `npm run test:coverage` (determinism: a test that asserts elapsed
 * milliseconds depends on the machine). Serial, so the tests do not compete with each other for the CPU.
 */
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['tests/timing/**/*.test.{ts,tsx}'],
      environment: 'node',
      restoreMocks: true,
      fileParallelism: false,
    },
  }),
);
