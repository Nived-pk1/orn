/**
 * Step 4.2a (no PERFORMANCE_ARCHITECTURE.md §2 row; informal). What stays on the main thread when the compute worker
 * hands the store the findings it computed: `replaceState` and `reload` with and without precomputed findings, design
 * tier, dense. Both alternate two states so every call replaces different content. The precomputed findings are built
 * once, outside the timed part (that is the worker's work); the timed part is the check, the index build (D2: on main),
 * the finding-store commit, the ChangeSet and the history reset. The differences are what leaves the main thread.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore, type PrecomputedFindings } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';

const first = tierState('design', 'dense', 1);
const second = tierState('design', 'dense', 2);
const stamped = new Map<CanonicalState, PrecomputedFindings>([
  [first, precomputedOf(first, 0)],
  [second, precomputedOf(second, 0)],
]);
const forRevision = (state: CanonicalState, revision: number): PrecomputedFindings => ({ ...(stamped.get(state) as PrecomputedFindings), revision });

const must = (ok: boolean, what: string): void => {
  if (!ok) throw new Error(`bench setup: ${what} was refused`);
};

describe('replaceState (design tier, dense)', () => {
  const plain = createCanonicalStore({ initial: first, validateInitial: false });
  let a = 0;
  bench('in-process: validateAll + index build + commit', () => must(plain.replaceState(a++ % 2 === 0 ? second : first, 'import').ok, 'replaceState'), SLOW_BENCH_OPTIONS);

  const fast = createCanonicalStore({ initial: first, validateInitial: false });
  let b = 0;
  bench(
    'precomputed findings: check + index build + commit',
    () => {
      const target = b++ % 2 === 0 ? second : first;
      must(fast.replaceState(target, 'import', forRevision(target, fast.getRevision() + 1)).ok, 'replaceState with precomputed findings');
    },
    SLOW_BENCH_OPTIONS,
  );
});

describe('reload (design tier, dense)', () => {
  const plain = createCanonicalStore({ initial: first, validateInitial: false, readOnly: () => true });
  let a = 0;
  bench('in-process: validateAll + index build + commit', () => must(plain.reload(a++ % 2 === 0 ? second : first, 1_000).ok, 'reload'), SLOW_BENCH_OPTIONS);

  const fast = createCanonicalStore({ initial: first, validateInitial: false, readOnly: () => true });
  let b = 0;
  bench(
    'precomputed findings: check + index build + commit',
    () => {
      const target = b++ % 2 === 0 ? second : first;
      must(fast.reload(target, 1_000, forRevision(target, 1_000)).ok, 'reload with precomputed findings');
    },
    SLOW_BENCH_OPTIONS,
  );
});
