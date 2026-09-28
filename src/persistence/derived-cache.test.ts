import { describe, expect, it } from 'vitest';
import { freshDb, quotaError } from '@/test-support/persistence-kit';
import type { DerivedCacheInput } from './contracts';
import { createDerivedCache } from './derived-cache';
import type { PersistenceEvent } from './events';

const item = (key: string, byteSize = 10, cacheKind: DerivedCacheInput['cacheKind'] = 'depiction'): DerivedCacheInput => ({
  key,
  cacheKind,
  value: `<svg>${key}</svg>`,
  byteSize,
});

function rig(softCapBytes?: number) {
  const { db, faults } = freshDb();
  const events: PersistenceEvent[] = [];
  let now = 1000;
  const cache = createDerivedCache({ db, clock: { nowMs: () => (now += 1) }, onEvent: (e) => events.push(e), ...(softCapBytes !== undefined ? { softCapBytes } : {}) });
  const keys = async () => (await db.derivedCache.orderBy('lastUsedAt').primaryKeys()) as string[];
  return { db, cache, events, keys, faults };
}

describe('derived cache', () => {
  it('stores and returns a row, stamping lastUsedAt from the injected clock', async () => {
    const { cache } = rig();
    expect(await cache.put(item('a'))).toEqual({ ok: true });
    const row = await cache.get('a');
    expect(row).toMatchObject({ key: 'a', cacheKind: 'depiction', value: '<svg>a</svg>', byteSize: 10 });
    expect(row?.lastUsedAt).toBeGreaterThan(1000);
  });

  it('a miss is undefined', async () => {
    expect(await rig().cache.get('nothing')).toBeUndefined();
  });

  it('get moves a row to the most recently used end', async () => {
    const { cache, keys } = rig();
    for (const k of ['a', 'b', 'c']) await cache.put(item(k));
    expect(await keys()).toEqual(['a', 'b', 'c']);
    await cache.get('a');
    expect(await keys()).toEqual(['b', 'c', 'a']);
  });

  it('putting the same key replaces the row', async () => {
    const { cache, db } = rig();
    await cache.put(item('a', 10));
    await cache.put({ ...item('a', 25), value: 'newer' });
    expect(await db.derivedCache.count()).toBe(1);
    expect((await cache.get('a'))?.value).toBe('newer');
  });

  it('over the soft cap the least recently used rows go first, never the row just written, and it is reported', async () => {
    const { cache, keys, events } = rig(30);
    for (const k of ['a', 'b', 'c']) await cache.put(item(k, 10));
    await cache.get('a');
    await cache.put(item('d', 10));
    expect(await keys()).toEqual(['c', 'a', 'd']);
    expect(events).toEqual([{ type: 'derived_cache_evicted', rows: 1, bytes: 10, reason: 'soft_cap' }]);
  });

  it('a single row bigger than the cap keeps only that row', async () => {
    const { cache, keys } = rig(30);
    for (const k of ['a', 'b']) await cache.put(item(k, 10));
    await cache.put(item('big', 100));
    expect(await keys()).toEqual(['big']);
  });

  it('the running total survives replacements and evictions (a second cap round evicts correctly)', async () => {
    const { cache, keys } = rig(30);
    for (const k of ['a', 'b', 'c']) await cache.put(item(k, 10));
    await cache.put(item('a', 10));
    await cache.put(item('d', 10));
    await cache.put(item('e', 10));
    expect((await keys()).length).toBe(3);
  });

  it('evictForQuota removes the least recently used half (at least one) and reports it', async () => {
    const { cache, keys, events } = rig();
    for (const k of ['a', 'b', 'c', 'd', 'e']) await cache.put(item(k, 5));
    expect(await cache.evictForQuota()).toBe(3);
    expect(await keys()).toEqual(['d', 'e']);
    expect(events).toContainEqual({ type: 'derived_cache_evicted', rows: 3, bytes: 15, reason: 'quota' });
    expect(await cache.evictForQuota()).toBe(1);
    expect(await cache.evictForQuota()).toBe(1);
    expect(await cache.evictForQuota()).toBe(0);
    expect(await keys()).toEqual([]);
  });

  it('a put that hits the quota is a value, not an exception, and the total is recomputed afterwards', async () => {
    const { cache, faults, events, keys } = rig(100);
    await cache.put(item('a', 10));
    faults.fail('derivedCache', quotaError);
    const failed = await cache.put(item('b', 10));
    expect(failed).toMatchObject({ ok: false, reason: 'quota' });
    expect(events.some((e) => e.type === 'derived_cache_error' && e.operation === 'put')).toBe(true);
    faults.clear();
    expect(await cache.put(item('b', 10))).toEqual({ ok: true });
    expect(await keys()).toEqual(['a', 'b']);
  });

  it('any other put failure is reported with reason error', async () => {
    const { cache, faults } = rig();
    faults.fail('derivedCache', () => new Error('broken store'));
    expect(await cache.put(item('a'))).toMatchObject({ ok: false, reason: 'error', message: expect.stringContaining('broken store') });
  });

  it('a get that fails is a miss and is reported', async () => {
    const { cache, faults, events } = rig();
    await cache.put(item('a'));
    faults.fail('derivedCache', () => new Error('cannot touch'));
    expect(await cache.get('a')).toBeUndefined();
    expect(events).toContainEqual({ type: 'derived_cache_error', operation: 'get', message: expect.stringContaining('cannot touch') });
  });
});
