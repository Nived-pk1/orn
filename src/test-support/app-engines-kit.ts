/**
 * The chem, layout and search workers for the tests of the app services (step 5.1b): each factory starts a REAL host over an
 * in-memory port pair (every message structured-cloned), with fakes only where the real thing is slow or needs a browser: a fake
 * RDKit module (`CCO` is ethanol unless told otherwise) and a fake ELK. The kit records every thread the factories made and every
 * call a worker received, so a test can prove WHEN a thread is created. Test-only.
 */
import { createRdkitToolkit, loadRdkit, withChemCache } from '@/chem';
import { createElkEngine } from '@/layout/elk';
import { createSearchEngine } from '@/search/engine';
import type { SearchEngine } from '@/search/contracts';
import { createChemHandlers } from '@/workers/chem/handlers';
import { createLayoutHandlers } from '@/workers/layout/handlers';
import { createSearchHandlers } from '@/workers/search/handlers';
import { createRpcHost } from '@/workers/rpc/host';
import type { WorkerFactory } from '@/workers/rpc/contracts';
import { createFakeRdkit, ETHANOL_SPEC, type FakeMolSpec, type FakeRdkit } from './fake-rdkit';
import { createFakeElk, type FakeElk } from './layout-fakes';
import { createMemoryWorkers, type MemoryWorker } from './rpc-memory-port';

export interface WorkerSlot {
  readonly workers: MemoryWorker[];
  /** `index:method` of every call the workers received, in order. */
  readonly calls: string[];
}

export interface EngineKit {
  readonly factories: { readonly chem: WorkerFactory; readonly layout: WorkerFactory; readonly search: WorkerFactory };
  readonly chem: WorkerSlot & {
    readonly rdkit: FakeRdkit;
    /** While set, loading RDKit rejects with it (the WASM is blocked). */
    loadFailure: Error | undefined;
    /** Times RDKit was asked to load. */
    loads(): number;
    /** While set, a worker call waits for it (the toolkit is slow). */
    gate: Promise<void> | undefined;
    /** A call for which this answers true never returns (the toolkit hangs on that input). */
    hangWhen: ((method: string, params: unknown) => boolean) | undefined;
  };
  readonly layout: WorkerSlot & { readonly elk: FakeElk };
  readonly search: WorkerSlot & { readonly engines: SearchEngine[] };
}

type Api = Record<string, (params: never, ctx: never) => Promise<unknown>>;

function logged<T extends object>(api: T, index: number, calls: string[], gate?: () => Promise<void> | undefined, hangWhen?: () => ((method: string, params: unknown) => boolean) | undefined): T {
  const wrapped: Api = {};
  for (const [method, inner] of Object.entries(api as unknown as Api)) {
    wrapped[method] = async (params, ctx) => {
      calls.push(`${index}:${method}`);
      if (hangWhen?.()?.(method, params) === true) await new Promise<never>(() => undefined);
      if (gate !== undefined && method !== 'warmUp') await gate();
      return inner(params, ctx);
    };
  }
  return wrapped as unknown as T;
}

export function engineKit(options: { readonly molecules?: Readonly<Record<string, FakeMolSpec | null>>; /** Load the real RDKit (slower; needed for real chemistry on the demo). */ readonly realRdkit?: boolean } = {}): EngineKit {
  const rdkit = createFakeRdkit({ CCO: ETHANOL_SPEC, ...(options.molecules ?? {}) });
  let loads = 0;
  const chemSlot = { loadFailure: undefined as Error | undefined, gate: undefined as Promise<void> | undefined, hangWhen: undefined as ((method: string, params: unknown) => boolean) | undefined };
  const chemCalls: string[] = [];
  const chem = createMemoryWorkers((worker, index) => {
    const toolkit = withChemCache(
      createRdkitToolkit({
        load: async () => {
          loads += 1;
          if (chemSlot.loadFailure !== undefined) throw chemSlot.loadFailure;
          return options.realRdkit === true ? loadRdkit() : rdkit.module;
        },
      }),
    );
    createRpcHost(worker.host, logged(createChemHandlers(toolkit, () => performance.now()), index, chemCalls, () => chemSlot.gate, () => chemSlot.hangWhen));
  });

  const elk = createFakeElk();
  const layoutCalls: string[] = [];
  const layout = createMemoryWorkers((worker, index) => {
    createRpcHost(worker.host, logged(createLayoutHandlers(createElkEngine({ make: elk.make, clock: () => performance.now() }), () => performance.now()), index, layoutCalls));
  });

  const engines: SearchEngine[] = [];
  const searchCalls: string[] = [];
  const search = createMemoryWorkers((worker, index) => {
    const engine = createSearchEngine();
    engines.push(engine);
    createRpcHost(worker.host, logged(createSearchHandlers(engine), index, searchCalls));
  });

  return {
    factories: { chem: chem.factory, layout: layout.factory, search: search.factory },
    chem: Object.defineProperties({ workers: chem.workers, calls: chemCalls, rdkit, loads: () => loads } as unknown as EngineKit['chem'], {
      loadFailure: { get: () => chemSlot.loadFailure, set: (value: Error | undefined) => void (chemSlot.loadFailure = value), enumerable: true },
      gate: { get: () => chemSlot.gate, set: (value: Promise<void> | undefined) => void (chemSlot.gate = value), enumerable: true },
      hangWhen: { get: () => chemSlot.hangWhen, set: (value: ((method: string, params: unknown) => boolean) | undefined) => void (chemSlot.hangWhen = value), enumerable: true },
    }),
    layout: { workers: layout.workers, calls: layoutCalls, elk },
    search: { workers: search.workers, calls: searchCalls, engines },
  };
}

/** A fake RDKit molecule table for every structure of the species of a state (each its own canonical SMILES, all C2H6O). */
export function fakeMoleculesFor(state: { readonly records: { readonly species: Readonly<Record<string, { readonly structure?: { readonly value: string } }>> } }): Record<string, FakeMolSpec> {
  const out: Record<string, FakeMolSpec> = {};
  for (const species of Object.values(state.records.species)) {
    const value = species.structure?.value;
    if (value !== undefined) out[value] = { ...ETHANOL_SPEC, smiles: value };
  }
  return out;
}
