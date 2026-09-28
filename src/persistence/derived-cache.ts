/**
 * The disposable derivedCache store (docs/PERSISTENCE.md §2, §11): depictions, layouts, search index, structure
 * facts. Least recently used rows go first, either to stay under the soft cap or, in an emergency, to make room
 * for a canonical write (quota). Nothing here is canonical, so a failing cache write is a value, never a
 * SaveStatus problem; it is still reported through `onEvent` (nothing silent).
 */
import type { Clock } from '@/core/dataset/contracts';
import type { DerivedCacheInput, DerivedCacheRow, DerivedPutResult } from './contracts';
import type { OrnDb } from './db';
import { describeError, isQuotaError, type PersistenceEventSink } from './events';

export const DERIVED_CACHE_SOFT_CAP_BYTES = 100 * 1024 * 1024;

export interface DerivedCache {
  put(input: DerivedCacheInput): Promise<DerivedPutResult>;
  get(key: string): Promise<DerivedCacheRow | undefined>;
  /** Evicts the least recently used half of the rows (at least one). Returns how many went; 0 when empty. */
  evictForQuota(): Promise<number>;
}

export interface DerivedCacheOptions {
  readonly db: OrnDb;
  readonly clock: Clock;
  readonly softCapBytes?: number;
  readonly onEvent?: PersistenceEventSink;
}

export function createDerivedCache(options: DerivedCacheOptions): DerivedCache {
  const { db, clock, onEvent } = options;
  const table = db.derivedCache;
  const softCap = options.softCapBytes ?? DERIVED_CACHE_SOFT_CAP_BYTES;
  /** Sum of stored byteSize, scanned once on first use and kept in step after that; unknown after an emergency. */
  let total: number | undefined;
  /** Puts and evictions run one at a time so `total` cannot drift. */
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const result = chain.then(task, task);
    chain = result.catch(() => undefined);
    return result;
  };

  async function knownTotal(): Promise<number> {
    if (total === undefined) {
      let sum = 0;
      await table.each((row) => {
        sum += row.byteSize;
      });
      total = sum;
    }
    return total;
  }

  /** Deletes rows from the least recently used end while `keepGoing` says so; `spare` is never deleted. */
  async function evictLru(reason: 'quota' | 'soft_cap', keepGoing: (rows: number, bytes: number) => boolean, spare?: string): Promise<number> {
    const keys: string[] = [];
    let bytes = 0;
    await table
      .orderBy('lastUsedAt')
      .until(() => !keepGoing(keys.length, bytes))
      .each((row) => {
        if (row.key === spare) return;
        keys.push(row.key);
        bytes += row.byteSize;
      });
    if (keys.length === 0) return 0;
    await table.bulkDelete(keys);
    total = reason === 'quota' || total === undefined ? undefined : total - bytes;
    onEvent?.({ type: 'derived_cache_evicted', rows: keys.length, bytes, reason });
    return keys.length;
  }

  const evictForQuota = (): Promise<number> =>
    serial(async () => {
      const goal = Math.max(1, Math.ceil((await table.count()) / 2));
      return evictLru('quota', (rows) => rows < goal);
    });

  async function write(row: DerivedCacheRow): Promise<void> {
    const before = await knownTotal();
    const old = await table.get(row.key);
    await table.put(row);
    total = before - (old?.byteSize ?? 0) + row.byteSize;
    if (total > softCap) {
      const over = total - softCap;
      await evictLru('soft_cap', (_rows, bytes) => bytes < over, row.key);
    }
  }

  return {
    evictForQuota,
    put(input) {
      const row: DerivedCacheRow = { ...input, lastUsedAt: clock.nowMs() };
      return serial(async (): Promise<DerivedPutResult> => {
        try {
          await write(row);
          return { ok: true };
        } catch (error) {
          const message = describeError(error);
          onEvent?.({ type: 'derived_cache_error', operation: 'put', message });
          total = undefined;
          return { ok: false, reason: isQuotaError(error) ? 'quota' : 'error', message };
        }
      });
    },
    async get(key) {
      try {
        const row = await table.get(key);
        if (row === undefined) return undefined;
        const lastUsedAt = clock.nowMs();
        await table.update(key, { lastUsedAt });
        return { ...row, lastUsedAt };
      } catch (error) {
        onEvent?.({ type: 'derived_cache_error', operation: 'get', message: describeError(error) });
        return undefined;
      }
    },
  };
}
