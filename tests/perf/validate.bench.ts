/**
 * Full validation (docs/PERFORMANCE_ARCHITECTURE.md §2): L1–L3 over the whole state < 3 s in the compute
 * worker, design tier. `validateTouched` is benchmarked against a commit in `commit.bench.ts`; this file
 * is the "whole state" budget only.
 */
import { bench, describe } from 'vitest';
import { validator } from '@/core/validation';
import { buildIndexes, SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`validateAll (design tier, ${shape})`, () => {
    const state = tierState('design', shape);
    const indexes = buildIndexes(state);

    // SLOW_BENCH_OPTIONS (docs/PROGRESS.md step 2.11): 300-400 ms/sample, wide budget margin — a minimum
    // time window instead of FAST_BENCH_OPTIONS' 100-sample floor, which would take minutes here.
    bench(
      'validateAll, whole state',
      () => {
        validator.validateAll(state, indexes);
      },
      SLOW_BENCH_OPTIONS,
    );
  });
}
