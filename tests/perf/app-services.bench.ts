/**
 * The app services' main-thread cost at the design tier (docs/IMPLEMENTATION_PLAN.md step 5.1a, Phase 5 decision Q1; informal:
 * PERFORMANCE_ARCHITECTURE.md §2 has no row for these, no baseline). Main-thread code in Node, hub_explosion (5,000 reactions,
 * one species used by 1,000 of them):
 *  - DerivedIndexes, first build (`indexEngine.build` at the first `current()`);
 *  - DerivedIndexes, apply after an ordinary edit (one record), after a rename of the hub record itself (one record with 1,000
 *    referrers) and after `replaceReferences` on that hub (about 1,020 records) - the cost that lands at the first read after the
 *    commit, off the commit path. A ChangeSet is announced to the service by hand with the state alternating between the edited
 *    and the original one (every edit here only UPDATES records, so the same refs serve both directions), the revision
 *    advancing by one each time;
 *  - the main-thread parts of a services boot: the store built from boot's precomputed findings (indexes built once, findings
 *    checked), and a whole `createAppServices` over fake-indexeddb with the compute host IN-MEMORY on this thread (so it also
 *    contains the worker's own work: an upper bound, not main-thread time; fake-indexeddb's bulk read is not our code either).
 */
import { bench, describe } from 'vitest';
import { createAppServices, createDerivedIndexes } from '@/app/services';
import { createCanonicalStore, type CanonicalStore } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { withFields } from '@/test-support/command-kit';
import { buildIndexes, designTierHubState, FAST_BENCH_OPTIONS, leastReferencedSpecies, mostReferencedSpecies, SLOW_BENCH_OPTIONS } from '@/test-support/perf-kit';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { must } from '@/test-support/state-fixture';

const initial = designTierHubState();
const indexes = buildIndexes(initial);
const hub: RecordRef = mostReferencedSpecies(initial, indexes);
const other: RecordRef = leastReferencedSpecies(initial, indexes);
const clock = { nowMs: () => performance.now() };

function edit(build: (state: CanonicalState) => Parameters<ReturnType<typeof createCanonicalStore>['dispatch']>[0]): { readonly after: CanonicalState; readonly changes: ChangeSet } {
  const store = createCanonicalStore({ initial, revision: 1, validateInitial: false });
  let captured: ChangeSet | undefined;
  store.subscribe((changes) => {
    captured = changes;
  });
  const result = store.dispatch(build(initial));
  if (!result.ok || captured === undefined) throw new Error('bench setup commit rejected');
  if (captured.created.length + captured.deleted.length > 0) throw new Error('bench setup: the edit must only update records');
  return { after: store.getState(), changes: captured };
}

const ordinary = edit((state) => ({ label: 'bench: edit one species', commands: [{ type: 'record.update', record: withFields(must(state.records.species[other.id]), { notes: 'bench edit' }) }] }));
// A rename of the hub (its folded name, display and everything that reads the name change), not just notes.
const renamedHub = (state: CanonicalState): Record<string, unknown> => {
  const species = must(state.records.species[hub.id]);
  return { names: { ...species.names, canonical: `${species.names.canonical} (renamed)` } };
};
const hubRecord = edit((state) => ({ label: 'bench: rename the hub record', commands: [{ type: 'record.update', record: withFields(must(state.records.species[hub.id]), renamedHub(state)) }] }));
const hubReplace = edit(() => ({ label: 'bench: merge hub', commands: [{ type: 'record.replaceReferences', from: hub, to: other }] }));

/** A store the bench drives by hand: every announcement is one ChangeSet, alternating between the edited and the original state. */
function drivenService(variant: { readonly after: CanonicalState; readonly changes: ChangeSet }): () => void {
  let state = initial;
  let revision = 1;
  const listeners = new Set<(changes: ChangeSet) => void>();
  const store: Pick<CanonicalStore, 'getState' | 'getRevision' | 'subscribe'> = {
    getState: () => state,
    getRevision: () => revision,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
  const service = createDerivedIndexes({ store, clock });
  service.current();
  let edited = false;
  return () => {
    edited = !edited;
    state = edited ? variant.after : initial;
    revision += 1;
    for (const listener of listeners) listener({ ...variant.changes, revision });
    service.current();
  };
}

describe('DerivedIndexes (design tier, hub_explosion): first build', () => {
  const store = createCanonicalStore({ initial, revision: 1, validateInitial: false });
  bench('first build (indexEngine.build at the first current())', () => void createDerivedIndexes({ store, clock }).current(), SLOW_BENCH_OPTIONS);
});

describe('DerivedIndexes (design tier, hub_explosion): apply at the first read after an edit', () => {
  const applyOrdinary = drivenService(ordinary);
  bench('apply after an ordinary edit (1 record)', applyOrdinary, FAST_BENCH_OPTIONS);
  const applyHubRecord = drivenService(hubRecord);
  bench('apply after a hub record edit (1 record, 1,000 referrers)', applyHubRecord, FAST_BENCH_OPTIONS);
  const applyHubReplace = drivenService(hubReplace);
  bench('apply after replaceReferences on the hub (~1,020 records)', applyHubReplace, SLOW_BENCH_OPTIONS);
});

// Seeded once, outside every timed region: the database holds the whole design-tier state.
const world = await worldHolding(initial, 1);

describe('services boot (design tier, hub_explosion): the main-thread parts', () => {
  const precomputed = precomputedOf(initial, 1);
  bench('store from boot precomputed findings (indexes built once, findings checked)', () => void createCanonicalStore({ initial, revision: 1, precomputed }), SLOW_BENCH_OPTIONS);

  bench(
    'whole createAppServices over fake-indexeddb, compute host in memory on this thread (upper bound)',
    async () => {
      const services = await createAppServices(testEnv({ world }).env);
      await services.dispose();
    },
    SLOW_BENCH_OPTIONS,
  );
});
