/**
 * The chem and layout services of the app (step 5.1b): each over an `EngineClient` (lazy thread, warm-up gate, status). A missing
 * factory gives a service whose every call answers "unavailable" as a value; the layout service additionally reports a fallback
 * layout and the layout notes in the event log and as the LAST notice in AppStatus (nothing silent, PERFORMANCE §11).
 * Step 5.5d (item h): layouts are also kept in `derivedCache` (kind `layout`, one row per cache key) once the adapter is attached, so a
 * reload does not ask the worker again; only the writer tab saves, any tab reads; a refused write is `AppStatus.layoutCache` and a log
 * line, never an error.
 */
import type { CheckCall, ChemService } from '@/workers/chem';
import { CHEM_SPECS, createChemService } from '@/workers/chem';
import type { JsonValue } from '@/core/schema';
import type { LayoutResult } from '@/layout/contracts';
import type { DexieAdapter } from '@/persistence';
import { createLayoutService, LAYOUT_SPECS, type LayoutOutcome, type LayoutPersistPort, type LayoutService, type LayoutServiceStats } from '@/workers/layout';
import type { ChemWorkerApi, LayoutWorkerApi, WorkerFactory } from '@/workers/rpc/contracts';
import { createEngineClient, type RetryEngineResult } from './engine-client';
import type { EventLogWriter, StatusWriter } from './status';

export interface EnginePart<Service> {
  readonly service: Service;
  retry(): Promise<RetryEngineResult>;
  stop(): void;
}

interface PartOptions {
  readonly factory: WorkerFactory | undefined;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
}

const NO_CHEM = 'there is no chemistry worker in this environment';
const none = { ok: false, reason: 'unavailable', error: NO_CHEM } as const;
const noChem: ChemService = {
  parse: () => Promise.resolve(none),
  depict: () => Promise.resolve(none),
  checkSpecies: (): Promise<CheckCall<never>> => Promise.resolve(none),
  checkReaction: (): Promise<CheckCall<never>> => Promise.resolve(none),
  checkMechanism: (): Promise<CheckCall<never>> => Promise.resolve(none),
  matches: (): Promise<CheckCall<never>> => Promise.resolve(none),
};

export function createChemPart(options: PartOptions): EnginePart<ChemService> {
  const engine = createEngineClient<ChemWorkerApi>({ name: 'chem', specs: CHEM_SPECS, ...options });
  return {
    service: engine.client === undefined ? noChem : createChemService(engine.client, engine.gate),
    retry: () => engine.retry(),
    stop: () => engine.stop(),
  };
}

const NO_LAYOUT = 'there is no layout worker in this environment';
const noLayout: LayoutService = {
  layout: (): Promise<LayoutOutcome> => Promise.resolve({ ok: false, code: 'UNAVAILABLE', message: NO_LAYOUT }),
  stats: (): LayoutServiceStats => ({ cacheHits: 0, cacheSize: 0, elk: 0, fallback: { timeout: 0, elk_error: 0, engine_unavailable: 0 }, superseded: 0, unavailable: 0 }),
};

/** The layout part: the engine part plus the one thing only boot can do later (the adapter is opened after the part is made). */
export interface LayoutPart extends EnginePart<LayoutService> {
  /** Gives the part the database its layouts are kept in; undefined: memory only. Call once, before the first layout. */
  attachCache(adapter: DexieAdapter | undefined): void;
}

/** `derivedCache` key of a layout: the layout cache key is a pure function of the request, so a row is valid for every dataset that asks the same. */
export const LAYOUT_ROW_PREFIX = 'layout:';

export function createLayoutPart(options: PartOptions): LayoutPart {
  const { status, log } = options;
  let adapter: DexieAdapter | undefined;
  const persist: LayoutPersistPort = {
    async get(key) {
      if (adapter === undefined) return undefined;
      const row = await adapter.getDerived(`${LAYOUT_ROW_PREFIX}${key}`);
      return row === undefined || row.cacheKind !== 'layout' ? undefined : (row.value as unknown as LayoutResult);
    },
    async put(key, result) {
      if (adapter === undefined || status.get().mode !== 'writer') return { ok: true };
      const json = JSON.stringify(result);
      const put = await adapter.putDerived({ key: `${LAYOUT_ROW_PREFIX}${key}`, cacheKind: 'layout', value: JSON.parse(json) as JsonValue, byteSize: json.length });
      const was = status.get().layoutCache;
      if (put.ok) {
        if (was.state !== 'saved') status.update({ layoutCache: { ...was, state: 'saved', message: null } });
        return put;
      }
      const message = `the layout was not saved for the next start (${put.reason}: ${put.message})`;
      log.add({ source: 'app', event: { type: 'layout_cache_refused', message } });
      status.update({ layoutCache: { ...was, state: 'refused', message: put.reason } });
      return { ok: false, message };
    },
  };
  const engine = createEngineClient<LayoutWorkerApi>({ name: 'layout', specs: LAYOUT_SPECS, ...options });
  const inner = engine.client === undefined ? noLayout : createLayoutService({ client: engine.client, gate: engine.gate, persist });
  const notice = (message: string): void => {
    log.add({ source: 'app', event: { type: 'layout_notice', message } });
    status.update({ layoutNotice: message });
  };
  const service: LayoutService = {
    async layout(view, request, call) {
      const outcome = await inner.layout(view, request, call);
      const fromStore = inner.stats().persisted?.hits ?? 0;
      if (fromStore !== status.get().layoutCache.fromStore) status.update({ layoutCache: { ...status.get().layoutCache, fromStore } });
      if (!outcome.ok) {
        if (outcome.code === 'UNAVAILABLE') notice(`layout of "${view}": ${outcome.message}`);
      } else if (!outcome.cached) {
        const { engine: used, fallbackReason, notes } = outcome.result;
        // `grid` (step 5.5c) is a layout of its own, not a degraded one: it is only reported when it has notes
        const own = used === 'elk' || used === 'grid';
        if (!own || notes.length > 0) {
          const head = own ? 'layout' : `fallback layout (${fallbackReason ?? 'no reason given'})`;
          notice(`${head} of "${view}"${notes.length === 0 ? '' : `: ${notes.join('; ')}`}`);
        }
      }
      return outcome;
    },
    stats: () => inner.stats(),
  };
  return {
    service,
    retry: () => engine.retry(),
    stop: () => engine.stop(),
    attachCache: (next) => {
      adapter = next;
    },
  };
}
