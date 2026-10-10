/**
 * The persisted layout cache of the layout service (step 5.5d, item h): a warm layout is read from the store and the worker is not
 * asked; every answer the service caches is offered to the store; a stored row that does not answer the request is counted and never
 * used; a store that refuses (quota), fails or throws is tolerated: the layout is still returned.
 */
import { describe, expect, it } from 'vitest';
import type { LayoutRequest, LayoutResult } from '@/layout/contracts';
import { layoutCacheKey } from '@/layout/cache-key';
import { createElkEngine } from '@/layout/elk';
import { request } from '@/test-support/layout-kit';
import { createFakeElk } from '@/test-support/layout-fakes';
import { createMemoryWorkers } from '@/test-support/rpc-memory-port';
import { createRpcClient, createRpcHost, createWarmUpGate } from '@/workers/rpc';
import type { LayoutWorkerApi } from '@/workers/rpc/contracts';
import { createLayoutHandlers } from './handlers';
import { createLayoutService, type LayoutPersistPort, type LayoutPutOutcome } from './service';
import { LAYOUT_SPECS } from './specs';

const clock = () => performance.now();
const small = (requestId = 'req'): LayoutRequest => request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']], requestId });

/** A store in a Map; `put` can be told to refuse or to throw, `get` to throw. */
function memoryPort(behaviour: { put?: () => LayoutPutOutcome | Promise<LayoutPutOutcome>; getThrows?: boolean } = {}) {
  const rows = new Map<string, LayoutResult>();
  const port: LayoutPersistPort = {
    async get(key) {
      if (behaviour.getThrows === true) throw new Error('the database is gone');
      const row = rows.get(key);
      return row === undefined ? undefined : structuredClone(row);
    },
    async put(key, result) {
      const answer = behaviour.put === undefined ? ({ ok: true } as const) : await behaviour.put();
      if (answer.ok) rows.set(key, structuredClone(result));
      return answer;
    },
  };
  return { rows, port };
}

function rig(persist: LayoutPersistPort | undefined) {
  const elk = createFakeElk();
  const workers = createMemoryWorkers((worker) => void createRpcHost(worker.host, createLayoutHandlers(createElkEngine({ make: elk.make, clock }), clock)));
  const gate = createWarmUpGate<LayoutWorkerApi>();
  const client = createRpcClient<LayoutWorkerApi>({ factory: workers.factory, specs: LAYOUT_SPECS, options: { onRestart: gate.onRestart } });
  return { elk, service: createLayoutService({ client, gate, ...(persist === undefined ? {} : { persist }) }) };
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('the persisted layout cache', () => {
  it('stores what the worker answered, under the request\'s cache key', async () => {
    const { rows, port } = memoryPort();
    const { service, elk } = rig(port);
    const out = await service.layout('v', small());
    await settle();
    expect(out).toMatchObject({ ok: true, cached: false });
    expect(elk.graphs).toHaveLength(1);
    expect([...rows.keys()]).toEqual([layoutCacheKey(small())]);
  });

  it('a second service (a reload) reads the stored layout: the worker is never asked, and the requestId is the new one', async () => {
    const { port } = memoryPort();
    const first = rig(port);
    const original = await first.service.layout('v', small('one'));
    await settle();
    const second = rig(port);
    const warm = await second.service.layout('v', small('two'));
    expect(warm).toMatchObject({ ok: true, cached: true, result: { requestId: 'two' } });
    if (!original.ok || !warm.ok) throw new Error('unreachable');
    expect(warm.result.positions).toEqual(original.result.positions);
    expect(second.elk.graphs).toEqual([]);
    expect(second.service.stats().persisted).toEqual({ hits: 1, rejected: 0, refused: 0 });
    // and it is in the memory cache now: the store is not asked a second time
    expect(await second.service.layout('v', small('three'))).toMatchObject({ cached: true });
    expect(second.service.stats()).toMatchObject({ cacheHits: 1, persisted: { hits: 1 } });
  });

  it('a stored row that does not answer the request (another key, a missing node, a missing route) is counted and never used', async () => {
    const { port, rows } = memoryPort();
    const first = rig(port);
    await first.service.layout('v', small());
    await settle();
    const key = layoutCacheKey(small());
    const row = rows.get(key) as LayoutResult;
    const broken: [string, LayoutResult][] = [
      ['another key', { ...row, cacheKey: 'layout/4:other' }],
      ['a node without a position', { ...row, positions: { a: row.positions['a'] as never } }],
      ['an edge without a route', { ...row, edgeRoutes: {} }],
    ];
    for (const [name, bad] of broken) {
      rows.set(key, bad);
      const next = rig(port);
      const out = await next.service.layout('v', small());
      expect(out, name).toMatchObject({ ok: true, cached: false });
      expect(next.elk.graphs, name).toHaveLength(1);
      expect(next.service.stats().persisted, name).toMatchObject({ hits: 0, rejected: 1 });
    }
  });

  it('a store that refuses (quota) is tolerated: the layout is returned and the refusal is counted', async () => {
    const { port, rows } = memoryPort({ put: () => ({ ok: false, message: 'quota: the browser has no room' }) });
    const { service } = rig(port);
    const out = await service.layout('v', small());
    await settle();
    expect(out).toMatchObject({ ok: true, cached: false });
    expect(rows.size).toBe(0);
    expect(service.stats().persisted).toMatchObject({ refused: 1 });
  });

  it('a store whose get or put throws is a miss and a refusal, never an error', async () => {
    const throwing = memoryPort({ getThrows: true, put: () => Promise.reject(new Error('boom')) });
    const { service, elk } = rig(throwing.port);
    expect(await service.layout('v', small())).toMatchObject({ ok: true, cached: false });
    await settle();
    expect(elk.graphs).toHaveLength(1);
    expect(service.stats().persisted).toMatchObject({ hits: 0, refused: 1 });
  });

  it('without a port nothing changes: stats carry zeros', async () => {
    const { service } = rig(undefined);
    await service.layout('v', small());
    expect(service.stats().persisted).toEqual({ hits: 0, rejected: 0, refused: 0 });
  });

  it('a newer request while the store is being read supersedes the older one', async () => {
    const releases: (() => void)[] = [];
    const slow: LayoutPersistPort = {
      get: () => new Promise((resolve) => void releases.push(() => resolve(undefined))),
      put: () => Promise.resolve({ ok: true }),
    };
    const { service } = rig(slow);
    const older = service.layout('v', small('old'));
    await settle();
    const newer = service.layout('v', { ...small('new'), seed: 5 });
    await settle();
    for (const release of releases) release();
    expect(await older).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await newer).toMatchObject({ ok: true });
  });
});
