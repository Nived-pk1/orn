/**
 * Commit path (docs/PERFORMANCE_ARCHITECTURE.md §2): "Commit, accepted or rejected" < 16 ms, undo/redo
 * < 16 ms, design tier. Also measures `Validator.scopeOf` computed twice per commit
 * (`core/commands/store.ts`). Step 2.10 replaced the rejected-commit index rebuild with an incremental
 * rollback (the inverse ChangeSet through the same apply path); this bench is what confirms it. Every bench
 * uses FAST_BENCH_OPTIONS (docs/PROGRESS.md step 2.11) for a stable p99 instead of vitest bench's default
 * ~10-30 samples.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { validator } from '@/core/validation';
import { withFields } from '@/test-support/command-kit';
import {
  buildIndexes,
  designTierHubState,
  FAST_BENCH_OPTIONS,
  mostReferencedSpecies,
  oneHubState,
  tierState,
} from '@/test-support/perf-kit';
import { must } from '@/test-support/state-fixture';

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`commit (design tier, ${shape})`, () => {
    const initial = tierState('design', shape);
    const store = createCanonicalStore({ initial, validateInitial: false });
    let n = 0;

    bench(
      'dispatch: update one species (notes)',
      () => {
        n += 1;
        const state = store.getState();
        const id = Object.keys(state.records.species)[n % Object.keys(state.records.species).length] as string;
        const record = must(state.records.species[id]);
        store.dispatch({ label: `bench-${n}`, commands: [{ type: 'record.update', record: withFields(record, { notes: `n${n}` }) }] });
      },
      FAST_BENCH_OPTIONS,
    );

    bench(
      'undo, then redo',
      () => {
        store.undo();
        store.redo();
      },
      FAST_BENCH_OPTIONS,
    );

    bench(
      'rejected commit: strips a published reaction to zero participants (incremental rollback)',
      () => {
        n += 1;
        const state = store.getState();
        const reactionIds = Object.keys(state.records.reaction);
        const id = reactionIds[n % reactionIds.length] as string;
        const reaction = must(state.records.reaction[id]);
        store.dispatch({ label: `bench-reject-${n}`, commands: [{ type: 'record.update', record: withFields(reaction, { participants: [] }) }] });
      },
      FAST_BENCH_OPTIONS,
    );
  });

  describe(`scopeOf (design tier, ${shape})`, () => {
    const state = tierState('design', shape);
    const indexes = buildIndexes(state);
    const hub = mostReferencedSpecies(state, indexes);

    bench(
      'scopeOf once, touching the hub',
      () => {
        validator.scopeOf(state, indexes, [hub]);
      },
      FAST_BENCH_OPTIONS,
    );

    bench(
      "scopeOf twice, touching the hub (today's store.commit() plus validateTouched)",
      () => {
        validator.scopeOf(state, indexes, [hub]);
        validator.scopeOf(state, indexes, [hub]);
      },
      FAST_BENCH_OPTIONS,
    );

    bench(
      'validateTouched, touching the hub (one scopeOf call plus rule execution)',
      () => {
        validator.validateTouched(state, indexes, [hub]);
      },
      FAST_BENCH_OPTIONS,
    );
  });
}

describe('scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions', () => {
  const state = oneHubState();
  const indexes = buildIndexes(state);
  const hub = mostReferencedSpecies(state, indexes);

  bench(
    'scopeOf once, touching the hub',
    () => {
      validator.scopeOf(state, indexes, [hub]);
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'scopeOf twice, touching the hub',
    () => {
      validator.scopeOf(state, indexes, [hub]);
      validator.scopeOf(state, indexes, [hub]);
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'validateTouched, touching the hub',
    () => {
      validator.validateTouched(state, indexes, [hub]);
    },
    FAST_BENCH_OPTIONS,
  );
});

/**
 * Design-tier-scale "like water" scenario (docs/IMPLEMENTATION_PLAN.md §2 step 2.9): one species referenced
 * by 1,000 of the state's 5,000 reactions, at the full design-tier reaction count — distinct from the
 * ADV-012 literal case above, whose dataset has only 1,000 reactions in total.
 */
describe('commit / validateTouched — design tier, one hub of 1,000 reactions (like water)', () => {
  const initial = designTierHubState();
  const initialIndexes = buildIndexes(initial);
  const hub = mostReferencedSpecies(initial, initialIndexes);
  const store = createCanonicalStore({ initial, validateInitial: false });
  let n = 0;

  bench(
    'dispatch: update the hub species (notes)',
    () => {
      n += 1;
      const state = store.getState();
      const record = must(state.records.species[hub.id]);
      store.dispatch({ label: `bench-water-${n}`, commands: [{ type: 'record.update', record: withFields(record, { notes: `n${n}` }) }] });
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'validateTouched, touching the hub',
    () => {
      validator.validateTouched(initial, initialIndexes, [hub]);
    },
    FAST_BENCH_OPTIONS,
  );
});
