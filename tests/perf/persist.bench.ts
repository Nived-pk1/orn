/**
 * Persistence write path (docs/IMPLEMENTATION_PLAN.md step 3.1; PERFORMANCE_ARCHITECTURE.md §2 has no row of its
 * own, so these are informal). Two kinds of entry:
 *  - enqueue + coalesce: the SYNCHRONOUS cost the main thread pays per commit (`writeChanges` up to the point
 *    where the transaction would start). The queue's `persist` never settles, so every ChangeSet after the
 *    first lands in the pending batch, which is exactly the coalescing path.
 *  - prepare transaction rows: the ORN code that turns a pending batch into the rows one transaction stores
 *    (`prepareTransactionRows`), with no IndexedDB at all.
 *  - flush on fake-indexeddb, ordinary edit: a SMOKE measurement that the whole cycle runs end to end. It is dominated
 *    by fake-indexeddb (a bare Dexie put costs the same), NOT real IndexedDB: real timing is traced at Gates E/F. The
 *    hub-edit flush was removed in the step 3.1 review: it measured fake-indexeddb only (~17 s per sample).
 * "Ordinary edit" = one record. "Hub edit" = `replaceReferences` on the design-tier "like water" hub
 * (5,000 reactions, one species used by 1,000 of them): one ChangeSet that updates ~1,000 reactions.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { startBatch } from '@/persistence/coalesce';
import { prepareTransactionRows } from '@/persistence/rows';
import { createWriteQueue } from '@/persistence/write-queue';
import { withFields } from '@/test-support/command-kit';
import { freshAdapter, seedChangeSet } from '@/test-support/persistence-kit';
import { buildIndexes, designTierHubState, FAST_BENCH_OPTIONS, leastReferencedSpecies, mostReferencedSpecies } from '@/test-support/perf-kit';
import { must } from '@/test-support/state-fixture';

interface Captured {
  readonly changes: ChangeSet;
  readonly next: CanonicalState;
}

const initial = designTierHubState();
const indexes = buildIndexes(initial);
const hub: RecordRef = mostReferencedSpecies(initial, indexes);
const other: RecordRef = leastReferencedSpecies(initial, indexes);

/** Commits one envelope on a store over `initial` and returns the ChangeSet with the state it produced. */
function captureCommit(build: (state: CanonicalState) => Parameters<ReturnType<typeof createCanonicalStore>['dispatch']>[0]): Captured {
  const store = createCanonicalStore({ initial, revision: 1, validateInitial: false });
  let captured: Captured | undefined;
  store.subscribe((changes) => {
    captured = { changes, next: store.getState() };
  });
  const result = store.dispatch(build(initial));
  if (!result.ok) throw new Error(`bench setup commit rejected: ${result.error.code} ${result.error.message}`);
  return must(captured, 'captured ChangeSet');
}

const ordinary = captureCommit((state) => ({
  label: 'bench: edit one species',
  commands: [{ type: 'record.update', record: withFields(must(state.records.species[other.id]), { notes: 'bench edit' }) }],
}));
const hubEdit = captureCommit(() => ({ label: 'bench: merge hub', commands: [{ type: 'record.replaceReferences', from: hub, to: other }] }));

describe('persist (design tier, hub_explosion)', () => {
  const queue = createWriteQueue({
    persist: () => new Promise<void>(() => undefined),
    onQuota: async () => false,
    scheduler: { after: () => () => undefined },
    initialRevision: 1,
  });
  let revision = 1;
  const next = (captured: Captured): ChangeSet => ({ ...captured.changes, revision: (revision += 1) });
  // One enqueue starts the drain and parks its batch "in flight"; everything after coalesces into `pending`.
  void queue.enqueue(next(ordinary), ordinary.next);

  bench(
    'enqueue + coalesce, ordinary edit (1 record)',
    () => {
      void queue.enqueue(next(ordinary), ordinary.next);
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'enqueue + coalesce, hub edit (1,000+ records in one ChangeSet)',
    () => {
      void queue.enqueue(next(hubEdit), hubEdit.next);
    },
    FAST_BENCH_OPTIONS,
  );
});

describe('persist (design tier, hub_explosion, prepare rows)', () => {
  const ordinaryBatch = startBatch(ordinary.changes, ordinary.next);
  const hubBatch = startBatch(hubEdit.changes, hubEdit.next);

  bench(
    'prepare transaction rows, ordinary edit (no IndexedDB)',
    () => {
      prepareTransactionRows(ordinaryBatch, false);
    },
    FAST_BENCH_OPTIONS,
  );

  bench(
    'prepare transaction rows, hub edit (no IndexedDB)',
    () => {
      prepareTransactionRows(hubBatch, false);
    },
    FAST_BENCH_OPTIONS,
  );
});

// Seeded once, outside every timed region (top-level await): the database holds the whole design-tier state.
const t = freshAdapter({ initialRevision: 0 });
await t.adapter.writeChanges(seedChangeSet(initial, 1), initial);

describe('persist (design tier, hub_explosion, flush on fake-indexeddb)', () => {
  let revision = 1;
  const flush = async (captured: Captured): Promise<void> => {
    revision += 1;
    await t.adapter.writeChanges({ ...captured.changes, revision }, captured.next);
  };

  bench('flush on fake-indexeddb, ordinary edit (smoke; dominated by fake-indexeddb, not real IndexedDB)', () => flush(ordinary), FAST_BENCH_OPTIONS);
});
