/**
 * The search worker in a REAL `worker_threads` thread (step 4.5): the sync boots it from a store, edits flow through as updates,
 * a query round trip answers like an in-process index, a newer query supersedes an older, and the serialised index loads into a second thread (a
 * crashed worker found out by the next update is tested in-process, src/workers/search/search.test.ts). Every message passes
 * through the real port's structured clone.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { AnyRecord } from '@/core/schema';
import { indexEngine } from '@/core/indexes/full';
import { createRpcClient, type RpcClient } from '@/workers/rpc';
import type { SearchWorkerApi } from '@/workers/rpc/contracts';
import { createSearchService, createSearchSync, SEARCH_SPECS } from '@/workers/search';
import { makeStore } from '@/test-support/command-kit';
import { spawnSearchWorker } from '@/test-support/rpc-node-port';
import { fullDocuments, searchStateOf } from '@/test-support/search-state';
import { freshEngine } from '@/test-support/search-rig';

const THREAD_TEST_TIMEOUT_MS = 60_000;
const running: RpcClient<SearchWorkerApi>[] = [];
afterEach(() => {
  for (const client of running.splice(0)) client.terminate();
});

const start = () => {
  const client = createRpcClient<SearchWorkerApi>({ factory: spawnSearchWorker, specs: SEARCH_SPECS });
  running.push(client);
  return { client, service: createSearchService({ client }) };
};
const PARAMS = { species: 20, classes: 3, reagents: 3, reactions: 14, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 4 } as const;

describe('the search worker in a real thread', () => {
  it('boots from a store, follows edits, answers like an in-process index; a second thread booted from the same store answers alike', async () => {
    const store = makeStore(searchStateOf(PARAMS));
    const { service } = start();
    let indexes = indexEngine.build(store.getState(), store.getRevision());
    const sync = createSearchSync({ state: store.getState, indexes: () => indexes, revision: store.getRevision, service, schedule: () => undefined });
    store.subscribe((changes) => {
      indexes = indexEngine.apply(indexes, changes, store.getState());
      sync.onChange(changes);
    });
    sync.reload();
    await sync.flush();
    expect(sync.stats().loads).toBe(1);

    const species = Object.values(store.getState().records.species).sort((a, b) => (a.id < b.id ? -1 : 1))[0] as unknown as { id: string; names: object };
    store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, canonical: 'Hexacosane', aliases: ['C₂₆H₅₄'] } } as unknown as AnyRecord }] });
    await sync.flush();
    const expected = freshEngine(store.getState(), store.getRevision());
    for (const text of ['Hexacosane', 'hexacos', 'C26H54', 'C₂₆H₅₄', 'reaction', 'Chapter']) {
      const out = await service.search('palette', { text, limit: 10, examVersionId: 'exv_s-2025' });
      if (!out.ok) throw new Error(`${text}: ${out.message}`);
      expect(out.value, text).toEqual(expected.search({ text, limit: 10, examVersionId: 'exv_s-2025' }));
    }
    const top = await service.search('palette', { text: 'Hexacosane', limit: 3 });
    expect(top.ok && top.value[0]?.ref.id).toBe(species.id);

    // a newer query on the same channel supersedes the older, through a real port
    const [older, newer] = [service.search('palette', { text: 'reaction', limit: 5 }), service.search('palette', { text: 'species', limit: 5 })];
    expect(await older).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await newer).toMatchObject({ ok: true });

    // a second thread booted from the same store answers alike
    const second = start();
    const sync2 = createSearchSync({ state: store.getState, indexes: () => indexes, revision: store.getRevision, service: second.service, schedule: () => undefined });
    sync2.reload();
    await sync2.flush();
    expect(sync2.stats().loads).toBe(1);
    const again = await second.service.search('palette', { text: 'Hexacosane', limit: 3 });
    expect(again.ok && again.value[0]?.ref.id).toBe(species.id);
  }, THREAD_TEST_TIMEOUT_MS);

  it('the serialised index of one thread loads into another and answers the same; search before a load is NOT_READY', async () => {
    const state = searchStateOf(PARAMS);
    const [a, b] = [start(), start()];
    expect(await b.service.search('p', { text: 'reaction', limit: 3 })).toMatchObject({ ok: false, code: 'NOT_READY' });
    const documents = fullDocuments(state, 5);
    expect(await a.service.load(documents, 5)).toMatchObject({ ok: true });
    const serialized = await a.service.serialize();
    if (!serialized.ok) throw new Error(serialized.message);
    expect(serialized.value.revision).toBe(5);
    expect(await b.service.loadSerialized(serialized.value)).toMatchObject({ ok: true, value: { ok: true, revision: 5, documents: documents.length } });
    for (const text of ['reaction', 'Species 1', 'chapter', 'SN2', 'wolff kishner']) {
      expect(await b.service.search('p', { text, limit: 10 }), text).toEqual(await a.service.search('p', { text, limit: 10 }));
    }
    expect(await b.service.apply({ fromRevision: 5, revision: 6, upsert: [], remove: [] })).toMatchObject({ ok: true, value: { ok: true, revision: 6 } });
    expect(await b.service.apply({ fromRevision: 5, revision: 7, upsert: [], remove: [] })).toMatchObject({ ok: true, value: { ok: false, code: 'REVISION_MISMATCH', have: 6 } });
  }, THREAD_TEST_TIMEOUT_MS);
});
