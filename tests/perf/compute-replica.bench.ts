/**
 * Step 4.2b (informal; PERFORMANCE_ARCHITECTURE.md §2 has one row that applies: "Full validation L1-L3 (design target)" < 3 s,
 * for the worker's `validateAll`). Design tier.
 *  - In the worker's own code (no thread): `replica.apply` for an ordinary edit (one species), a hub record
 *    edit (a rename of the 1,000-referrer hub: one record touched, ~1,000 referrers re-validated by rule, with `previous`:
 *    the Phase 9 exception 5 scenario) and a hub edit (`replaceReferences` on the "like water" hub, ~1,000 records touched), `validateAll` over the replica (dense and hub_explosion),
 *    and `load` (index build + `validateAll` + finding store).
 *  - Through a REAL `worker_threads` thread running the real compute entry: `applyChanges` round trip for an ordinary
 *    edit, and `loadReplica` of the design-tier state (what the clone costs, D3), plus the sender's blocking part of that
 *    clone measured with `v8.serialize`.
 * Each apply alternates a ChangeSet and its inverse so the replica can be applied to forever; the revision is rewritten to
 * follow the replica. D2 (clone of the core indexes versus building them) is not measured: the indexes are class
 * instances with private fields and Maps of a lineage, not plain data, and reaching in would change a contract.
 */
import { serialize } from 'node:v8';
import { afterAll, bench, describe } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { withFields } from '@/test-support/command-kit';
import { buildIndexes, designTierHubState, FAST_BENCH_OPTIONS, leastReferencedSpecies, mostReferencedSpecies, SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { must } from '@/test-support/state-fixture';
import { createReplica, type Replica } from '@/workers/compute/replica';
import { COMPUTE_SPECS } from '@/workers/compute/specs';
import { createRpcClient } from '@/workers/rpc';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

interface Pair {
  readonly forward: ChangeSet;
  readonly back: ChangeSet;
}

/** The ChangeSet of an edit and the ChangeSet of undoing it, produced by a real store. */
function pairOf(initial: CanonicalState, build: (state: CanonicalState) => Parameters<ReturnType<typeof createCanonicalStore>['dispatch']>[0]): Pair {
  const store = createCanonicalStore({ initial, revision: 0, validateInitial: false });
  const done = store.dispatch(build(initial));
  if (!done.ok) throw new Error(`bench setup commit rejected: ${done.error.code} ${done.error.message}`);
  const undone = store.undo();
  if (undone === null || !undone.ok) throw new Error('bench setup: undo failed');
  return { forward: done.changes, back: undone.changes };
}

/** Applies the pair alternately, each time as the next revision. */
function alternating(pair: Pair): (revision: number) => ChangeSet {
  let forward = true;
  return (revision) => {
    const changes = { ...(forward ? pair.forward : pair.back), revision };
    forward = !forward;
    return changes;
  };
}

const initial = designTierHubState();
const indexes = buildIndexes(initial);
const hub: RecordRef = mostReferencedSpecies(initial, indexes);
const other: RecordRef = leastReferencedSpecies(initial, indexes);
const ordinary = pairOf(initial, (state) => ({
  label: 'bench: edit one species',
  commands: [{ type: 'record.update', record: withFields(must(state.records.species[other.id]), { notes: 'bench edit' }) }],
}));
const hubRename = pairOf(initial, (state) => {
  const species = must(state.records.species[hub.id]);
  return { label: 'bench: rename the hub', commands: [{ type: 'record.update', record: withFields(species, { names: { ...species.names, canonical: 'bench renamed hub' } }) }] };
});
const hubEdit = pairOf(initial, () => ({ label: 'bench: merge hub', commands: [{ type: 'record.replaceReferences', from: hub, to: other }] }));

function loaded(state: CanonicalState): Replica {
  const replica = createReplica();
  replica.load(state, 0);
  return replica;
}

function applier(replica: Replica, pair: Pair): () => void {
  const next = alternating(pair);
  return () => {
    const answer = replica.apply(next((replica.revision() ?? 0) + 1));
    if (!answer.ok) throw new Error('bench: the replica refused a ChangeSet');
  };
}

describe('replica applyChanges in the worker code (design tier, hub_explosion)', () => {
  const ordinaryReplica = loaded(initial);
  bench('ordinary edit (one species)', applier(ordinaryReplica, ordinary), FAST_BENCH_OPTIONS);
  const renameReplica = loaded(initial);
  bench('hub record edit (rename of the ~1,000-referrer hub species, one record)', applier(renameReplica, hubRename), FAST_BENCH_OPTIONS);
  const hubReplica = loaded(initial);
  bench('hub edit (replaceReferences on the ~1,000-reaction hub)', applier(hubReplica, hubEdit), SLOW_BENCH_OPTIONS);
});

describe('replica validateAll in the worker code (design tier)', () => {
  for (const shape of ['dense', 'hub_explosion'] as const) {
    const replica = loaded(shape === 'dense' ? tierState('design', 'dense') : initial);
    bench(
      `${shape}: validateAll over the replica`,
      () => {
        if (!replica.validateAll(0).ok) throw new Error('bench: validateAll refused');
      },
      SLOW_BENCH_OPTIONS,
    );
  }
});

describe('replica load in the worker code (design tier, dense)', () => {
  const state = tierState('design', 'dense');
  const replica = createReplica();
  bench('load: freeze + index build + validateAll + finding store', () => void replica.load(state, 0), SLOW_BENCH_OPTIONS);
});

const client = createRpcClient<ComputeWorkerApi>({ factory: () => spawnComputeWorker(), specs: COMPUTE_SPECS });
// Thread start-up (tsx) and the first load are not part of any sample.
const first = await client.loadReplica({ state: initial, revision: 0 }, { timeoutMs: 120_000 });
if (!first.ok) throw new Error(`bench setup: loadReplica failed: ${first.error.code}`);
afterAll(() => client.terminate());

describe('compute worker in a real thread (design tier, hub_explosion)', () => {
  let revision = 0;
  const next = alternating(ordinary);

  bench(
    'applyChanges round trip, ordinary edit',
    async () => {
      revision += 1;
      const answer = await client.applyChanges({ changes: next(revision) });
      if (!answer.ok || !answer.value.ok) throw new Error('bench: applyChanges failed');
    },
    FAST_BENCH_OPTIONS,
  );
  bench(
    'loadReplica round trip, the whole design-tier state (clone out, index build, validateAll, findings back)',
    async () => {
      const answer = await client.loadReplica({ state: initial, revision: 0 }, { timeoutMs: 120_000 });
      if (!answer.ok) throw new Error('bench: loadReplica failed');
    },
    SLOW_BENCH_OPTIONS,
  );
  bench('sender side of that clone: v8.serialize of the design-tier state (blocks the caller)', () => void serialize(initial), SLOW_BENCH_OPTIONS);
});
