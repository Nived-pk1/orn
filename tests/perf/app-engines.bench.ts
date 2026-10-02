/**
 * Step 5.1b (docs/IMPLEMENTATION_PLAN.md; informal: PERFORMANCE_ARCHITECTURE.md §2 has no row for these, no baseline): search at the
 * design tier (5,000 reactions, 2,000 other entities, dense), main-thread code in Node.
 *  - the search FULL LOAD on the main thread: a new DerivedIndexes (its first build included), the sync's `reload` + `flush`
 *    (every document built by the pure builder), with the worker stood in for by a stub; and the same with the message's
 *    `structuredClone` (what `postMessage` costs the sender);
 *  - the warm boot against the full load, until the index can answer: full = documents + first index build + the engine's `load`;
 *    warm = the engine's `loadSerialized` + `adopt`. The serialised size is printed once.
 * Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { bench, describe } from 'vitest';
import { createDerivedIndexes } from '@/app/services';
import { createCanonicalStore } from '@/core/commands';
import { createSearchEngine } from '@/search/engine';
import type { SearchDocument } from '@/search/contracts';
import type { SearchService } from '@/workers/search/service';
import { createSearchSync } from '@/workers/search/sync';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { fullDocuments, withSearchExtras } from '@/test-support/search-state';

const state = withSearchExtras(tierState('design', 'dense'));
const clock = { nowMs: () => performance.now() };
const store = createCanonicalStore({ initial: state, revision: 1, validateInitial: false });
const reference = fullDocuments(state, 1);
if (reference.filter((doc) => doc.kind === 'reaction').length < 5_000) throw new Error('bench: the design tier has fewer than 5,000 reaction documents');

const engineOfRecord = createSearchEngine();
engineOfRecord.load(reference, 1);
const serialized = engineOfRecord.serialize();
console.info(`[app-engines bench] ${reference.length} documents; serialized index ${serialized.json.length} characters (${new TextEncoder().encode(serialized.json).length} bytes UTF-8)`);

type Stub = Pick<SearchService, 'load' | 'apply'>;
const stub = (copy: boolean): Stub => ({
  load: (documents: readonly SearchDocument[]) => {
    if (copy) structuredClone(documents);
    return Promise.resolve({ ok: true, value: undefined });
  },
  apply: () => Promise.reject(new Error('bench: no update expected')),
});

async function fullLoad(service: Stub): Promise<void> {
  const indexes = createDerivedIndexes({ store, clock });
  const sync = createSearchSync({ state: store.getState, indexes: () => indexes.current(), revision: store.getRevision, service, schedule: () => undefined });
  sync.reload();
  await sync.flush();
  if (sync.stats().loads !== 1) throw new Error('bench: the load did not happen');
  indexes.dispose();
}

describe('search full load on the main thread (design tier, dense, 5,000 reactions)', () => {
  bench('documents built from the state, first DerivedIndexes build included (worker stubbed, no message copy)', () => fullLoad(stub(false)), SLOW_BENCH_OPTIONS);
  bench('the same plus the structuredClone of the load message (what postMessage costs the sender)', () => fullLoad(stub(true)), SLOW_BENCH_OPTIONS);
});

describe('search boot until the index answers: warm cache against a full load (design tier, no RPC)', () => {
  bench('full load: documents + first index build (main) + engine.load (worker)', async () => {
    const engine = createSearchEngine();
    const service: Stub = {
      load: (documents, revision) => {
        engine.load(documents, revision);
        return Promise.resolve({ ok: true, value: undefined });
      },
      apply: () => Promise.reject(new Error('bench: no update expected')),
    };
    await fullLoad(service);
    if (engine.size() < 5_000) throw new Error('bench: the index is empty');
  }, SLOW_BENCH_OPTIONS);
  bench('warm boot: engine.loadSerialized (worker) + adopt (main)', () => {
    const engine = createSearchEngine();
    const answer = engine.loadSerialized(structuredClone(serialized));
    if (!answer.ok) throw new Error('bench: the cache was refused');
    const sync = createSearchSync({ state: store.getState, indexes: () => { throw new Error('bench: nothing may build documents'); }, revision: store.getRevision, service: stub(false), schedule: () => undefined });
    if (!sync.adopt(store.getRevision())) throw new Error('bench: adopt refused');
  }, SLOW_BENCH_OPTIONS);
});
