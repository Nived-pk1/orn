/**
 * Search in the app (step 5.1b, SEARCH §1, §6, PERSISTENCE §11): the search client (the worker thread is created at its first call,
 * which is the boot decision below), the service, and the sync over its ports (the state, the FULL indexes from
 * `services.indexes.current()`, the revision, a debounce from `env.timers`, the L4 service's derived formulas).
 *
 * Warm boot. After the index has been up to date for `SEARCH_CACHE_QUIET_MS` the worker's index is serialised and stored as ONE row
 * in `derivedCache` (kind `search_index`, key `search_index`, value `{ revision, json }`), only by the writer tab. At boot a row of
 * the store's revision is loaded with `loadSerialized` and adopted (`SearchSync.adopt`): no document is built. Any other row, a
 * `BAD_INDEX`, a worker failure or a store that moved on meanwhile is ONE full load. A refused cache write is a status, never an error.
 */
import type { StoreHandle } from '@/core/commands';
import type { RecordRef } from '@/core/schema';
import type { DexieAdapter, Scheduler } from '@/persistence';
import { createRpcClient } from '@/workers/rpc/client';
import type { SearchWorkerApi, WorkerFactory } from '@/workers/rpc/contracts';
import { createSearchService, createSearchSync, SEARCH_SPECS, type SearchService, type SearchSync } from '@/workers/search';
import type { DerivedIndexes } from './derived-indexes';
import { createLazyClient } from './lazy-client';
import type { EventLogWriter, SearchView, StatusWriter } from './status';
import { createDebounce, SEARCH_CACHE_QUIET_MS, SEARCH_CACHE_REARMS, SEARCH_QUIET_MS } from './timing';
import { createWorkerHealth } from './worker-health';

export const SEARCH_CACHE_KEY = 'search_index';

export interface SearchPartOptions {
  readonly factory: WorkerFactory | undefined;
  readonly store: StoreHandle;
  readonly indexes: Pick<DerivedIndexes, 'current'>;
  readonly derivedFormulaOf: (ref: RecordRef) => string | undefined;
  /** undefined: session-only (no cache). */
  readonly adapter: DexieAdapter | undefined;
  readonly timers: Scheduler;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
}

export interface SearchPart {
  /** Queries, with a newer query on the same channel superseding the older. Answers a value when there is no worker. */
  readonly search: Pick<SearchService, 'search' | 'superseded'>;
  /** undefined when the environment has no search worker. */
  sync(): SearchSync | undefined;
  /** The L4 service learned (or dropped) the derived formulas of these species. */
  refresh(ids: readonly string[]): void;
  /** Resolves when the boot path (cache read, adopt or the decision to load) is settled. The load itself waits for its debounce. */
  started(): Promise<void>;
  stop(): void;
}

const NO_SEARCH = 'there is no search worker in this environment';
const absentSearch: Pick<SearchService, 'search' | 'superseded'> = {
  search: () => Promise.resolve({ ok: false, code: 'NOT_READY', message: NO_SEARCH }),
  superseded: () => 0,
};

interface CacheValue {
  readonly revision: number;
  readonly json: string;
}
const cacheValueOf = (value: unknown): CacheValue | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { revision, json } = value as { revision?: unknown; json?: unknown };
  return typeof revision === 'number' && Number.isInteger(revision) && typeof json === 'string' ? { revision, json } : undefined;
};
const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function createSearchPart(options: SearchPartOptions): SearchPart {
  const { factory, store, adapter, status, log } = options;
  const health = createWorkerHealth('search', status, log);
  if (factory === undefined) {
    health.absent(NO_SEARCH);
    return { search: absentSearch, sync: () => undefined, refresh: () => undefined, started: () => Promise.resolve(), stop: () => undefined };
  }
  health.idle();

  let sync = undefined as SearchSync | undefined; // created below: the client's restart hook and the cache refer to it first
  let stopped = false;
  let loadedFrom: SearchView['loadedFrom'] = 'none';
  let cache: SearchView['cache'] = { state: 'none', revision: null, message: null };
  let cachedRevision: number | null = null;
  let cancelCache: (() => void) | undefined;
  let rearms = 0;

  const client = createLazyClient<SearchWorkerApi>(SEARCH_SPECS, () => {
    health.started();
    log.add({ source: 'app', event: { type: 'worker_started', message: 'the search worker thread was created (first use)' } });
    return createRpcClient<SearchWorkerApi>({
      factory,
      specs: SEARCH_SPECS,
      options: { onEvent: health.onEvent, onRestart: health.restartHook(() => sync?.reload()) },
    });
  });
  const service = createSearchService({ client });
  const debounce = createDebounce(options.timers, SEARCH_QUIET_MS);

  const arm = (): void => {
    cancelCache?.();
    cancelCache = undefined;
    if (adapter === undefined || status.get().mode !== 'writer') return; // only the writer tab saves the cache (a follower reads it)
    cancelCache = options.timers.after(SEARCH_CACHE_QUIET_MS, () => {
      cancelCache = undefined;
      void writeCache();
    });
  };

  function publish(): void {
    if (stopped) return;
    const view = sync?.status();
    if (view === undefined) return;
    if (loadedFrom === 'none' && sync !== undefined && sync.stats().loads > 0) loadedFrom = 'full_load';
    status.update({ search: { state: view.state, indexRevision: view.indexRevision, loadedFrom, reason: view.reason, cache } });
    if (view.state === 'idle' && view.indexRevision === store.getRevision() && cachedRevision !== view.indexRevision) {
      rearms = 0;
      arm();
    }
  }

  async function writeCache(): Promise<void> {
    if (stopped || adapter === undefined || sync === undefined || status.get().mode !== 'writer') return;
    const now = sync.status();
    const revision = store.getRevision();
    if (cachedRevision === revision) return;
    if (now.state !== 'idle' || now.indexRevision !== revision) {
      if (rearms < SEARCH_CACHE_REARMS) {
        rearms += 1;
        arm();
      }
      return;
    }
    const refuse = (message: string): void => {
      cache = { state: 'refused', revision: null, message };
      log.add({ source: 'app', event: { type: 'search_cache_refused', message } });
      publish();
    };
    const out = await service.serialize();
    if (stopped) return;
    if (!out.ok) return refuse(`the search index could not be serialised (${out.code}: ${out.message})`);
    if (out.value.revision !== revision || store.getRevision() !== revision) {
      arm(); // the index or the store moved while it was being serialised; try again after another quiet period
      return;
    }
    const put = await adapter.putDerived({ key: SEARCH_CACHE_KEY, cacheKind: 'search_index', value: { revision, json: out.value.json }, byteSize: out.value.json.length });
    if (stopped) return;
    if (!put.ok) return refuse(`the search cache was not saved (${put.reason}: ${put.message})`);
    cachedRevision = revision;
    cache = { state: 'saved', revision, message: null };
    publish();
  }

  sync = createSearchSync({
    state: store.getState,
    indexes: () => options.indexes.current(),
    revision: store.getRevision,
    service,
    schedule: debounce.schedule,
    derivedFormulaOf: options.derivedFormulaOf,
    onStatus: publish,
  });
  const offStore = store.subscribe((changes) => {
    sync?.onChange(changes);
    rearms = 0;
    if (cancelCache !== undefined) arm(); // the quiet period starts over
  });

  async function boot(): Promise<void> {
    const note = (message: string): void => log.add({ source: 'app', event: { type: 'search_boot', message } });
    const fullLoad = (why: string): void => {
      note(`the search index is loaded in full (${why})`);
      sync?.reload();
    };
    if (adapter === undefined) return fullLoad('nothing is stored in this session');
    const row = await adapter.getDerived(SEARCH_CACHE_KEY);
    if (stopped) return;
    const value = row === undefined || row.cacheKind !== 'search_index' ? undefined : cacheValueOf(row.value);
    if (value === undefined) return fullLoad(row === undefined ? 'no warm-boot cache' : 'the warm-boot cache row is malformed');
    if (value.revision !== store.getRevision()) return fullLoad(`the warm-boot cache is for revision ${value.revision}, the store is at ${store.getRevision()}`);
    const loaded = await service.loadSerialized(value);
    if (stopped) return;
    if (!loaded.ok) return fullLoad(`the search worker did not take the cache (${loaded.code}: ${loaded.message})`);
    if (!loaded.value.ok) return fullLoad(`the cache was refused (${loaded.value.code}: ${loaded.value.message})`);
    if (sync?.adopt(value.revision) !== true) return fullLoad('the store moved on while the cache was loading');
    loadedFrom = 'warm_cache';
    cachedRevision = value.revision;
    cache = { state: 'saved', revision: value.revision, message: null };
    note(`the search index came from the warm-boot cache (revision ${value.revision}, ${loaded.value.documents} documents); no document was built`);
    publish();
  }

  let booted: Promise<void> | undefined;
  return {
    search: service,
    sync: () => sync,
    refresh: (ids) => sync?.refresh(ids),
    started() {
      booted ??= boot().catch((error: unknown) => {
        log.add({ source: 'app', event: { type: 'search_boot_failed', message: `the search boot path failed (${describe(error)}); loading in full` } });
        sync?.reload();
      });
      return booted;
    },
    stop() {
      stopped = true;
      offStore();
      cancelCache?.();
      debounce.cancel();
      sync?.dispose();
      client.terminate();
    },
  };
}
