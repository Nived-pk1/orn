/**
 * Step 6.1b part 2 (openItem 23): the MAIN-THREAD time of a follower's search sync after one ordinary edit by the writer, at the design tier
 * (5,000 reactions, hub_explosion-like dense shape with the search extras). What the follower's main thread does for one writer commit:
 * `applyRemote` (the store), the full indexes the search sync reads (DerivedIndexes), the change analysis, the documents built and hashed,
 * and the message to the search worker. The worker's own work (the index update) is not here: the service is a stub that answers at once,
 * so the figure is the main thread's. Two paths over the SAME rename of one species, alternating between two names:
 *  - "after": the ChangeSet of `applyRemote` is analysed like a commit (step 6.1b): the indexes are applied, one document is built and sent;
 *  - "before": the same ChangeSet marked as a reload (`reloaded`), which is what every `remote` ChangeSet was until 6.1b: the full indexes
 *    are built again and every document is built and sent in ONE full load.
 * Informal (budgetMs null); run once, alone; not bench:baseline, not bench:compare.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { AnyRecord } from '@/core/schema';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createSearchSync } from '@/workers/search/sync';
import type { SearchService } from '@/workers/search/service';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { withSearchExtras } from '@/test-support/search-state';

const base = withSearchExtras(tierState('design', 'dense'));
const target = Object.values(base.records.species)[3] as AnyRecord;
const named = (canonical: string): AnyRecord => ({ ...target, names: { ...(target as unknown as { names: object }).names, canonical } }) as unknown as AnyRecord;

const stub: Pick<SearchService, 'load' | 'apply'> = {
  load: async () => ({ ok: true, value: undefined }),
  apply: async (update) => ({ ok: true, value: { ok: true, revision: update.revision, upserted: update.upsert.length, removed: update.remove.length } }),
};

/** A follower whose store announces its ChangeSets marked as reloads (the old behaviour) or as they are. */
function follower(asReload: boolean) {
  const store = createCanonicalStore({ initial: base, revision: 1, readOnly: () => true, validateInitial: false });
  const view: Pick<StoreHandle, 'getState' | 'getRevision' | 'subscribe'> = {
    getState: store.getState,
    getRevision: store.getRevision,
    subscribe: (listener) => store.subscribe((changes: ChangeSet) => listener(asReload ? { ...changes, reloaded: true } : changes)),
  };
  const derived = createDerivedIndexes({ store: view, clock: { nowMs: () => performance.now() } });
  const sync = createSearchSync({ state: store.getState, indexes: () => derived.current(), revision: store.getRevision, service: stub, schedule: () => undefined });
  view.subscribe((changes) => sync.onChange(changes));
  let flip = false;
  return {
    async boot() {
      sync.reload();
      await sync.flush();
    },
    async edit() {
      flip = !flip;
      const result = store.applyRemote({ fromRevision: store.getRevision(), revision: store.getRevision() + 1, upserts: [named(flip ? 'Renamed species' : 'Renamed again')], deletedIds: [] });
      if (!result.ok) throw new Error(`bench: applyRemote refused: ${result.error.code}`);
      await sync.flush();
    },
    stats: () => sync.stats(),
  };
}

describe('follower search sync, one ordinary edit by the writer, design tier, main thread (step 6.1b)', () => {
  const after = follower(false);
  const before = follower(true);
  bench('after: applyRemote analysed like a commit (indexes applied, one document built and sent)', async () => {
    const loads = after.stats().loads;
    await after.edit();
    if (after.stats().loads !== loads) throw new Error('bench: the sync loaded in full');
  }, { ...SLOW_BENCH_OPTIONS, setup: () => after.boot() });
  bench('before: the same ChangeSet as a reload (indexes built again, one full load)', async () => {
    await before.edit();
  }, { ...SLOW_BENCH_OPTIONS, setup: () => before.boot() });
});
