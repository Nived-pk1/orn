/**
 * Step 5.1c review, follow-up a (informal; no budget row, no baseline): is the first DerivedIndexes build (and the store's own
 * index build) slower on a state that is a structuredClone, or that a store produced with replaceState, than on the generator's
 * own objects? Design tier, dense. Run once, alone.
 */
import { bench, describe } from 'vitest';
import { createDerivedIndexes, emptyState } from '@/app/services';
import { createCanonicalStore } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { withSearchExtras } from '@/test-support/search-state';

const generated = withSearchExtras(tierState('design', 'dense'));
const cloned = structuredClone(generated);
const empty = emptyState(createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: () => 0.5 }));
const holder = createCanonicalStore({ initial: empty, revision: 0, validateInitial: false });
const replaced = holder.replaceState(structuredClone(generated), 'import', precomputedOf(generated, 1));
if (!replaced.ok) throw new Error('bench: replaceState refused');
const afterReplace = holder.getState();

const clock = { nowMs: () => performance.now() };
const forms = [
  ['(i) the generator state', generated],
  ['(ii) a structuredClone of it', cloned],
  ['(iii) the state after replaceState of a clone', afterReplace],
] as const;

describe('first DerivedIndexes build', () => {
  for (const [name, state] of forms) {
    const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
    bench(name, () => {
      const indexes = createDerivedIndexes({ store, clock });
      indexes.current();
      indexes.dispose();
    }, SLOW_BENCH_OPTIONS);
  }
});

describe("the store's own index build (createCanonicalStore)", () => {
  for (const [name, state] of forms) {
    bench(name, () => {
      createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
    }, SLOW_BENCH_OPTIONS);
  }
});
