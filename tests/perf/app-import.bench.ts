/**
 * Step 5.1c (informal: no PERFORMANCE_ARCHITECTURE.md §2 row for these, no baseline; docs/IMPLEMENTATION_PLAN.md 5.1c): the
 * MAIN-THREAD parts of an import apply at the design tier (5,000 reactions, 2,000 other entities, dense), in Node:
 *  - receive the merged state and the worker's findings (the `structuredClone` a `postMessage` costs the receiver);
 *  - `replaceState` of the merged state with the worker's findings (store into an empty live store);
 *  - the first `DerivedIndexes` build over the imported state;
 *  - the search full load on main (documents built, worker stubbed).
 * Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { bench, describe } from 'vitest';
import { createDerivedIndexes } from '@/app/services';
import { createCanonicalStore } from '@/core/commands';
import { createSearchSync } from '@/workers/search/sync';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { withSearchExtras } from '@/test-support/search-state';
import { emptyState } from '@/app/services';
import { createIdFactory } from '@/core/dataset';

const merged = withSearchExtras(tierState('design', 'dense'));
const precomputed = precomputedOf(merged, 1);
const clock = { nowMs: () => performance.now() };
const empty = emptyState(createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: () => 0.5 }));

const imported = createCanonicalStore({ initial: empty, revision: 0, validateInitial: false });
const replaced = imported.replaceState(merged, 'import', precomputed);
if (!replaced.ok) throw new Error('bench: the merged state was refused');

describe('import apply, the main-thread parts (design tier, dense, 5,000 reactions)', () => {
  bench('receive the merged state and the worker findings (structuredClone)', () => {
    structuredClone({ mergedState: merged, precomputed });
  }, SLOW_BENCH_OPTIONS);

  bench('store.replaceState(merged, "import", the worker findings) into an empty store', () => {
    const store = createCanonicalStore({ initial: empty, revision: 0, validateInitial: false });
    const result = store.replaceState(merged, 'import', precomputed);
    if (!result.ok) throw new Error('bench: refused');
  }, SLOW_BENCH_OPTIONS);

  bench('DerivedIndexes: the first build over the imported state', () => {
    const indexes = createDerivedIndexes({ store: imported, clock });
    indexes.current();
    indexes.dispose();
  }, SLOW_BENCH_OPTIONS);

  bench('search full load on main: documents built, first DerivedIndexes build included (worker stubbed)', async () => {
    const indexes = createDerivedIndexes({ store: imported, clock });
    const sync = createSearchSync({
      state: imported.getState,
      indexes: () => indexes.current(),
      revision: imported.getRevision,
      service: { load: () => Promise.resolve({ ok: true, value: undefined }), apply: () => Promise.reject(new Error('bench: no update expected')) },
      schedule: () => undefined,
    });
    sync.reload();
    await sync.flush();
    if (sync.stats().loads !== 1) throw new Error('bench: the load did not happen');
    indexes.dispose();
  }, SLOW_BENCH_OPTIONS);
});
