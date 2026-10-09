/**
 * The chem and layout services of the app (step 5.1b): each over an `EngineClient` (lazy thread, warm-up gate, status). A missing
 * factory gives a service whose every call answers "unavailable" as a value; the layout service additionally reports a fallback
 * layout and the layout notes in the event log and as the LAST notice in AppStatus (nothing silent, PERFORMANCE §11).
 */
import type { CheckCall, ChemService } from '@/workers/chem';
import { CHEM_SPECS, createChemService } from '@/workers/chem';
import { createLayoutService, LAYOUT_SPECS, type LayoutOutcome, type LayoutService, type LayoutServiceStats } from '@/workers/layout';
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

export function createLayoutPart(options: PartOptions): EnginePart<LayoutService> {
  const { status, log } = options;
  const engine = createEngineClient<LayoutWorkerApi>({ name: 'layout', specs: LAYOUT_SPECS, ...options });
  const inner = engine.client === undefined ? noLayout : createLayoutService({ client: engine.client, gate: engine.gate });
  const notice = (message: string): void => {
    log.add({ source: 'app', event: { type: 'layout_notice', message } });
    status.update({ layoutNotice: message });
  };
  const service: LayoutService = {
    async layout(view, request, call) {
      const outcome = await inner.layout(view, request, call);
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
  return { service, retry: () => engine.retry(), stop: () => engine.stop() };
}
