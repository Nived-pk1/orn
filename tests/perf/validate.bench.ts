/**
 * Full validation (docs/PERFORMANCE_ARCHITECTURE.md §2): L1–L3 over the whole state < 3 s in the compute
 * worker, design tier. `validateTouched` is benchmarked against a commit in `commit.bench.ts`; this file
 * is the "whole state" budget only.
 */
import { bench, describe } from 'vitest';
import { validator } from '@/core/validation';
import { buildIndexes, tierState } from '@/test-support/perf-kit';

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`validateAll (design tier, ${shape})`, () => {
    const state = tierState('design', shape);
    const indexes = buildIndexes(state);

    bench('validateAll, whole state', () => {
      validator.validateAll(state, indexes);
    }, { iterations: 3, warmupIterations: 1 });
  });
}
