/**
 * Phase 4 DoD, row 1 (docs/IMPLEMENTATION_PLAN.md §3; step 4.6): "workers restart after an induced crash", for each of the four workers,
 * in a REAL `worker_threads` thread running the real host. The thread ends itself (`process.exit`) when a request for the named method
 * arrives (`workerData.crashOn`, tests only; the host and the handlers are untouched), the client fails the call with
 * `WORKER_CRASHED`, starts a new thread, and the work goes on. The compute worker's two crash tests already do this and are reused, not
 * repeated (tests/integration/compute-worker-threads.test.ts: "a crash under an idempotent call: restart, the hook reloads the
 * replica, ..." and "a crash under applyChanges: the replica is reloaded from the store, ...").
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AnyRecord } from '@/core/schema';
import { indexEngine } from '@/core/indexes/full';
import { makeStore } from '@/test-support/command-kit';
import { layoutProblems, request } from '@/test-support/layout-kit';
import { spawnChemWorker, spawnLayoutWorker, spawnSearchWorker } from '@/test-support/rpc-node-port';
import { searchStateOf } from '@/test-support/search-state';
import { freshEngine } from '@/test-support/search-rig';
import { createChemService } from '@/workers/chem/client';
import { CHEM_SPECS } from '@/workers/chem/specs';
import { createLayoutService, LAYOUT_SPECS } from '@/workers/layout';
import { createRpcClient, createWarmUpGate } from '@/workers/rpc';
import type { ChemWorkerApi, LayoutWorkerApi, RpcPort, SearchWorkerApi, WorkerEvent } from '@/workers/rpc/contracts';
import { createSearchService, createSearchSync, SEARCH_SPECS } from '@/workers/search';

/** Starting a thread under tsx takes seconds when the whole suite runs in parallel (the default 5 s is too tight). */
const THREAD_TEST_TIMEOUT_MS = 60_000;
const running: { terminate(): void }[] = [];
afterEach(() => {
  for (const client of running.splice(0)) client.terminate();
});

/** A factory whose FIRST thread crashes on `method`; every later thread is a normal one. */
function crashFirst(spawn: (crashOn?: string) => RpcPort, method: string) {
  const events: WorkerEvent[] = [];
  let started = 0;
  return { events, threads: () => started, factory: (): RpcPort => spawn((started += 1) === 1 ? method : undefined), onEvent: (e: WorkerEvent) => events.push(e) };
}
const crashes = (events: readonly WorkerEvent[]) => events.filter((e) => e.type === 'crash');
const restarts = (events: readonly WorkerEvent[]) => events.filter((e) => e.type === 'restart');

describe('Phase 4 DoD: an induced crash, a restart and a recovery, in a real thread', () => {
  it('the chem worker: a thread that exits under parse fails the call, is restarted, the call is retried once and answers from RDKit in the new thread', async () => {
    const rig = crashFirst(spawnChemWorker, 'parse');
    const gate = createWarmUpGate<ChemWorkerApi>();
    const client = createRpcClient<ChemWorkerApi>({ factory: rig.factory, specs: CHEM_SPECS, options: { onEvent: rig.onEvent, onRestart: gate.onRestart } });
    running.push(client);
    const chem = createChemService(client, gate);
    expect(await chem.parse({ format: 'smiles', value: 'CCO' })).toMatchObject({ ok: true, facts: { formula: 'C2H6O' } });
    expect(rig.threads()).toBe(2);
    expect(crashes(rig.events)).toHaveLength(1);
    expect(restarts(rig.events)).toHaveLength(1);
    expect(await chem.parse({ format: 'smiles', value: 'CCN' })).toMatchObject({ ok: true, facts: { formula: 'C2H7N' } });
    expect(rig.threads()).toBe(2); // the new thread keeps serving
  }, THREAD_TEST_TIMEOUT_MS);

  it('the layout worker: a thread that exits under layout is restarted, the retried layout is real ELK, the answer is valid and nothing fell back', async () => {
    const rig = crashFirst((crashOn) => spawnLayoutWorker('real', 5_000, crashOn), 'layout');
    const gate = createWarmUpGate<LayoutWorkerApi>();
    const client = createRpcClient<LayoutWorkerApi>({ factory: rig.factory, specs: LAYOUT_SPECS, options: { onEvent: rig.onEvent, onRestart: gate.onRestart } });
    running.push(client);
    const service = createLayoutService({ client, gate });
    const req = request({ nodes: ['a', 'b', 'c', 'd'], edges: [['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'd']] });
    const out = await service.layout('view', req);
    if (!out.ok) throw new Error(out.message);
    expect(out.result).toMatchObject({ engine: 'elk' });
    expect(layoutProblems(req, out.result)).toEqual([]);
    expect(rig.threads()).toBe(2);
    expect(crashes(rig.events)).toHaveLength(1);
    expect(restarts(rig.events)).toHaveLength(1);
    const again = await service.layout('view', { ...req, requestId: 'again' });
    expect(again.ok && again.result.engine).toBe('elk');
  }, THREAD_TEST_TIMEOUT_MS);

  it('the search worker: a thread that exits under search loses its index (NOT_READY), the next edit finds that out and reloads once, and the answers equal a fresh index', async () => {
    const rig = crashFirst(spawnSearchWorker, 'search');
    const client = createRpcClient<SearchWorkerApi>({ factory: rig.factory, specs: SEARCH_SPECS, options: { onEvent: rig.onEvent } });
    running.push(client);
    const service = createSearchService({ client });
    const store = makeStore(searchStateOf({ species: 20, classes: 3, reagents: 3, reactions: 14, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 4 }));
    let indexes = indexEngine.build(store.getState(), store.getRevision());
    const sync = createSearchSync({ state: store.getState, indexes: () => indexes, revision: store.getRevision, service, schedule: () => undefined });
    store.subscribe((changes) => {
      indexes = indexEngine.apply(indexes, changes, store.getState());
      sync.onChange(changes);
    });
    sync.reload();
    await sync.flush();
    expect(sync.stats().loads).toBe(1);

    // The first thread dies under this query; the retry reaches a new thread that has no index yet.
    expect(await service.search('palette', { text: 'reaction', limit: 5 })).toMatchObject({ ok: false, code: 'NOT_READY' });
    expect(rig.threads()).toBe(2);
    expect(crashes(rig.events)).toHaveLength(1);
    expect(restarts(rig.events)).toHaveLength(1);

    const species = Object.values(store.getState().records.species).sort((a, b) => (a.id < b.id ? -1 : 1))[0] as unknown as { id: string; names: object };
    store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, canonical: 'After the crash' } } as unknown as AnyRecord }] });
    await sync.flush();
    expect(sync.stats().loads).toBe(2); // one full load, found out by the update
    const expected = freshEngine(store.getState(), store.getRevision());
    for (const text of ['After the crash', 'reaction', 'species']) {
      const out = await service.search('palette', { text, limit: 10 });
      if (!out.ok) throw new Error(`${text}: ${out.message}`);
      expect(out.value, text).toEqual(expected.search({ text, limit: 10 }));
    }
  }, THREAD_TEST_TIMEOUT_MS);
});
