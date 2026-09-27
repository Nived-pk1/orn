/**
 * Commit path (docs/PERFORMANCE_ARCHITECTURE.md §2): commit < 16 ms, undo/redo < 16 ms, design tier.
 * Also measures the three Phase 1 performance open items this step closes out (docs/PROGRESS.md step
 * 1.12 / Gate A review §8.3): validateTouched's cost on a hub record, the index rebuild a rejected
 * commit pays for, and `Validator.scopeOf` computed twice per commit in `core/commands/store.ts`.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { validator } from '@/core/validation';
import { withFields } from '@/test-support/command-kit';
import { buildIndexes, mostReferencedSpecies, oneHubState, tierState } from '@/test-support/perf-kit';
import { must } from '@/test-support/state-fixture';

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`commit (design tier, ${shape})`, () => {
    const initial = tierState('design', shape);
    const store = createCanonicalStore({ initial, validateInitial: false });
    let n = 0;

    bench('dispatch: update one species (notes)', () => {
      n += 1;
      const state = store.getState();
      const id = Object.keys(state.records.species)[n % Object.keys(state.records.species).length] as string;
      const record = must(state.records.species[id]);
      store.dispatch({ label: `bench-${n}`, commands: [{ type: 'record.update', record: withFields(record, { notes: `n${n}` }) }] });
    });

    bench('undo, then redo', () => {
      store.undo();
      store.redo();
    });

    bench('rejected commit: strips a published reaction to zero participants (pays for an index rebuild)', () => {
      n += 1;
      const state = store.getState();
      const reactionIds = Object.keys(state.records.reaction);
      const id = reactionIds[n % reactionIds.length] as string;
      const reaction = must(state.records.reaction[id]);
      store.dispatch({ label: `bench-reject-${n}`, commands: [{ type: 'record.update', record: withFields(reaction, { participants: [] }) }] });
    });
  });

  describe(`scopeOf (design tier, ${shape})`, () => {
    const state = tierState('design', shape);
    const indexes = buildIndexes(state);
    const hub = mostReferencedSpecies(state, indexes);

    bench('scopeOf once, touching the hub', () => {
      validator.scopeOf(state, indexes, [hub]);
    });

    bench('scopeOf twice, touching the hub (today\'s store.commit() plus validateTouched)', () => {
      validator.scopeOf(state, indexes, [hub]);
      validator.scopeOf(state, indexes, [hub]);
    });

    bench('validateTouched, touching the hub (one scopeOf call plus rule execution)', () => {
      validator.validateTouched(state, indexes, [hub]);
    });
  });
}

describe('scopeOf / validateTouched — ADV-012 literal case: one hub, 1,000 reactions', () => {
  const state = oneHubState();
  const indexes = buildIndexes(state);
  const hub = mostReferencedSpecies(state, indexes);

  bench('scopeOf once, touching the hub', () => {
    validator.scopeOf(state, indexes, [hub]);
  });

  bench('scopeOf twice, touching the hub', () => {
    validator.scopeOf(state, indexes, [hub]);
    validator.scopeOf(state, indexes, [hub]);
  });

  bench('validateTouched, touching the hub', () => {
    validator.validateTouched(state, indexes, [hub]);
  });
});
