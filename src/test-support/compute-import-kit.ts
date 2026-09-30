/**
 * Helpers for the tests of the import in the compute worker (step 4.2c). Two drivers run the SAME scenario: `workerDriver`
 * (preview / revise / apply through the compute worker, a real store, the real persistence adapter on fake IndexedDB, the
 * real replica sync) and `inProcessDriver` (the Phase 3 session over a twin store with fake ports). Both mint IDs from the
 * same script (`nowIso` fixed, one seed per preview / revise from `mulberry32`), so their plans and results can be compared
 * for equality. Test-only.
 */
import { produce } from 'immer';
import type { StoreHandle } from '@/core/commands';
import { createIdFactory, type IdFactory } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { createImportSession, type AssetStagePort, type ImportApplyResult, type ImportPlan, type ImportPlanRequest, type ImportPreviewOutcome, type ImportSession, type ImportStorePort, type ParsedAsset } from '@/io';
import type { AssetBlobWrite } from '@/persistence/contracts';
import { attachWriteQueue } from '@/persistence/write-wiring';
import { createComputeImport, type ComputeImport, type SnapshotBytesPort } from '@/workers/compute/import-flow';
import { idFactoryFrom } from '@/workers/compute/ids';
import type { Replica } from '@/workers/compute/replica';
import type { ReplicaSync } from '@/workers/compute/sync';
import { makeStore, mulberry32 } from './command-kit';
import { rig, TEST_GENERATOR, type Rig, type RigOptions } from './compute-rig';
import { fakePorts, parseBytes, type FakePorts } from './import-kit';
import { freshAdapter, seedChangeSet, type TestAdapter } from './persistence-kit';

export const nameOf = (state: CanonicalState, id: string): string => (state.records.species[id] as unknown as { names: { canonical: string } }).names.canonical;

/** `state` with the canonical name of species `id` changed: a file that conflicts with (or differs from) the live dataset. */
export const renamed = (state: CanonicalState, id: string, name: string): CanonicalState =>
  produce(state, (draft) => {
    (draft.records.species[id] as unknown as { names: { canonical: string } }).names.canonical = name;
  });

export const NOW_ISO = '2026-09-30T12:00:00.000Z';
const seedOf = (next: () => number): number => Math.floor(next() * 0x1_0000_0000);

/** What a driver offers a scenario; results are the io contract types. */
export interface ImportDriver {
  preview(bytes: Uint8Array, fileName: string, request?: ImportPlanRequest): Promise<ImportPreviewOutcome>;
  revise(batchId: string, request: ImportPlanRequest): Promise<ImportPreviewOutcome>;
  cancel(batchId: string): Promise<boolean>;
  apply(batchId: string, plan: ImportPlan): Promise<ImportApplyResult>;
  state(): CanonicalState;
  revision(): number;
}

export interface FlowHooks {
  /** Replaces `store.replaceState` for one test (a refusal, an exception, a commit racing the import). */
  replaceState?: ImportStorePort['replaceState'];
  /** Replaces the adapter's `storeSnapshotBytes` for one test. */
  storeBytes?: SnapshotBytesPort['storeSnapshotBytes'];
}

export interface ImportFlow {
  readonly flow: ComputeImport;
  readonly hooks: FlowHooks;
  /** Everything the ports were asked, in order: 'storeBytes', 'deleteSnapshot', 'replaceState', 'stage', 'clear'. */
  readonly calls: string[];
}

/**
 * A store on a real adapter (fake IndexedDB): the seed is saved, the write queue is attached, and asset bytes staged by the
 * flow reach the same transaction as their records (Q1).
 */
export async function persistedStore(state: CanonicalState): Promise<{ readonly store: StoreHandle; readonly t: TestAdapter; readonly staged: () => readonly ParsedAsset[]; readonly stage: AssetStagePort }> {
  const store = makeStore(state, { revision: 1 });
  const t = freshAdapter({ initialRevision: 0 });
  await t.adapter.writeChanges(seedChangeSet(state, 1), state);
  let staged: readonly ParsedAsset[] = [];
  const stage: AssetStagePort = {
    stage: (assets) => {
      staged = assets;
    },
    clear: () => {
      staged = [];
    },
  };
  const wiring = attachWriteQueue(store, t.adapter, {
    blobsFor: (changes) => {
      const touched = new Set([...changes.created, ...changes.updated].map((r) => r.id));
      const blobs: AssetBlobWrite[] = staged.filter((a) => touched.has(a.assetId)).map((a) => ({ assetId: a.assetId, sha256: a.sha256, blob: new Blob([a.bytes as BlobPart]) }));
      return blobs.length === 0 ? undefined : blobs;
    },
  });
  if (!wiring.ok) throw new Error(wiring.message);
  return { store, t, staged: () => staged, stage };
}

/** The main-thread flow over `sync`, wired to `store` and the adapter `t` through ports, with hooks to break each step. */
export function importFlowFor(store: StoreHandle, t: TestAdapter, sync: ReplicaSync, stage: AssetStagePort, seed = 7): ImportFlow {
  const hooks: FlowHooks = {};
  const calls: string[] = [];
  const storePort: ImportStorePort = {
    getState: () => store.getState(),
    getRevision: () => store.getRevision(),
    isReadOnly: () => store.isReadOnly(),
    replaceState: (next, reason, precomputed) => {
      calls.push('replaceState');
      return hooks.replaceState !== undefined ? hooks.replaceState(next, reason, precomputed) : store.replaceState(next, reason, precomputed);
    },
  };
  const snapshots: SnapshotBytesPort = {
    storeSnapshotBytes: (input) => {
      calls.push('storeBytes');
      return hooks.storeBytes !== undefined ? hooks.storeBytes(input) : t.adapter.storeSnapshotBytes(input);
    },
    deleteSnapshot: (id) => {
      calls.push('deleteSnapshot');
      return t.adapter.deleteSnapshot(id);
    },
  };
  const loggedStage: AssetStagePort = {
    stage: (assets) => {
      calls.push('stage');
      stage.stage(assets);
    },
    clear: () => {
      calls.push('clear');
      stage.clear();
    },
  };
  const flow = createComputeImport({ sync, store: storePort, snapshots, batches: t.adapter, assetStage: loggedStage, ids: { now: () => NOW_ISO }, generator: TEST_GENERATOR, rng: { next: mulberry32(seed) } });
  return { flow, hooks, calls };
}

export interface WorkerImportRig extends ImportFlow {
  readonly store: StoreHandle;
  readonly t: TestAdapter;
  readonly r: Rig;
}

/** The whole worker-side rig in memory: real handlers behind an in-memory port pair (every message cloned). */
export async function workerImportRig(state: CanonicalState, options: { readonly seed?: number; readonly rig?: Omit<RigOptions, 'store'> } = {}): Promise<WorkerImportRig> {
  const { store, t, stage } = await persistedStore(state);
  const r = rig({ store, ...options.rig });
  await r.sync.settled();
  const flow = importFlowFor(store, t, r.sync, stage, options.seed);
  return { ...flow, store, t, r };
}

/** The newest replica the rig's workers created (the one the sync follows now). */
export const lastReplica = (rig: Pick<WorkerImportRig, 'r'>): Replica => rig.r.replicas[rig.r.replicas.length - 1] as Replica;

/** Unwraps a worker call: an RPC failure or a parse refusal is a test failure here. */
async function unwrap<T>(call: Promise<{ readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }>): Promise<T> {
  const result = await call;
  if (!result.ok) throw new Error(`worker call failed: ${result.error.code}: ${result.error.message}`);
  return result.value;
}

export function workerDriver(rigged: Pick<WorkerImportRig, 'flow' | 'store'>): ImportDriver {
  const { flow, store } = rigged;
  return {
    preview: async (bytes, fileName, request) => (await unwrap(flow.preview(new Blob([bytes as BlobPart]), fileName, request))) as ImportPreviewOutcome,
    revise: async (batchId, request) => (await unwrap(flow.revise(batchId, request))) as ImportPreviewOutcome,
    cancel: async (batchId) => (await unwrap(flow.cancel(batchId))).cancelled,
    apply: (batchId, plan) => flow.apply(batchId, plan),
    state: () => store.getState(),
    revision: () => store.getRevision(),
  };
}

export interface InProcess {
  readonly driver: ImportDriver;
  readonly store: StoreHandle;
  readonly ports: FakePorts;
  readonly session: ImportSession;
}

/** The Phase 3 session over a twin store, its IDs following the same script as the worker's (`idFactoryFrom` per call). */
export function inProcessDriver(state: CanonicalState, seed = 7): InProcess {
  const store = makeStore(state, { revision: 1 });
  const ports = fakePorts();
  const rng = mulberry32(seed);
  let current: IdFactory = createIdFactory({ nowMs: () => Date.parse(NOW_ISO) }, { next: () => 0 });
  const ids: IdFactory = { now: () => current.now(), newId: (prefix) => current.newId(prefix) };
  const session = createImportSession({
    store: {
      getState: () => store.getState(),
      getRevision: () => store.getRevision(),
      isReadOnly: () => store.isReadOnly(),
      replaceState: (next, reason, precomputed) => {
        ports.calls.push('replaceState');
        return store.replaceState(next, reason, precomputed);
      },
    },
    ids,
    snapshots: ports.snapshotPort,
    batches: ports.sink,
    assetStage: ports.stage,
  });
  const next = (): void => {
    current = idFactoryFrom({ nowIso: NOW_ISO, seed: seedOf(rng) });
  };
  const driver: ImportDriver = {
    async preview(bytes, fileName, request) {
      next();
      return session.preview({ parsed: await parseBytes(bytes, fileName), fileName, ...(request === undefined ? {} : { request }) });
    },
    async revise(batchId, request) {
      next();
      return session.revise(batchId, request);
    },
    cancel: async (batchId) => session.cancel(batchId),
    async apply(batchId, plan) {
      // The report time of the worker path is main's `ids.now()`, which is NOW_ISO here.
      current = idFactoryFrom({ nowIso: NOW_ISO, seed: 0 });
      return session.apply(batchId, plan);
    },
    state: () => store.getState(),
    revision: () => store.getRevision(),
  };
  return { driver, store, ports, session };
}

export function planOf(outcome: ImportPreviewOutcome): ImportPlan {
  if (!outcome.ok) throw new Error(`preview refused: ${outcome.code}: ${outcome.message}`);
  return outcome.plan;
}

/** The apply result without what legitimately differs between the two paths (the snapshot's ID). */
export function comparable(result: ImportApplyResult): unknown {
  if (!result.ok) return result;
  return { ...result, snapshotId: '<snapshot>', report: { ...result.report, snapshotId: '<snapshot>' } };
}
