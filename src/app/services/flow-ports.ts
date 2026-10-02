/**
 * Small pieces the flows share (step 5.1c): the asset stage connected to the write queue's `blobsFor` (bytes and records reach
 * IndexedDB in ONE transaction, PERSISTENCE §6), the store the flows see (a cancel is honoured at the commit point), and "done means
 * saved" (`durabilityOf`: flush, then read the SaveStatus). No chemistry; every failure is a value.
 */
import type { CanonicalStore, StoreHandle } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { AssetStagePort, ParsedAsset } from '@/io';
import type { AssetBlobWrite, DexieAdapter } from '@/persistence';
import type { Durability } from './flow-types';
import { saveViewOf } from './writer';

export interface AssetStage {
  readonly port: AssetStagePort;
  /** `attachWriteQueue`'s `blobsFor`: the staged bytes of the asset records this ChangeSet creates or updates. */
  blobsFor(changes: ChangeSet): readonly AssetBlobWrite[] | undefined;
}

export function createAssetStage(): AssetStage {
  let staged: readonly ParsedAsset[] = [];
  return {
    port: {
      stage: (assets) => {
        staged = assets;
      },
      clear: () => {
        staged = [];
      },
    },
    blobsFor(changes) {
      if (staged.length === 0) return undefined;
      const touched = new Set<string>([...changes.created, ...changes.updated].map((record) => String(record.id)));
      const blobs: AssetBlobWrite[] = staged
        .filter((asset) => touched.has(String(asset.assetId)))
        .map((asset) => ({ assetId: asset.assetId, sha256: asset.sha256, blob: new Blob([asset.bytes as BlobPart]) }));
      return blobs.length === 0 ? undefined : blobs;
    },
  };
}

/** Thrown by the guarded store at the commit point when the caller has cancelled; the Phase 3/4 flows turn it into a refusal that changes nothing. */
export class FlowCancelled extends Error {
  constructor() {
    super('cancelled by the caller before the commit');
    this.name = 'FlowCancelled';
  }
}

export type FlowStore = Pick<CanonicalStore, 'getState' | 'getRevision' | 'isReadOnly' | 'replaceState'>;

export interface GuardedStore extends FlowStore {
  /** True when the guard stopped a commit because the signal was aborted. */
  cancelledAtCommit(): boolean;
  /** True when a commit went through this guard. */
  committed(): boolean;
}

/**
 * The store a flow commits through. `onCommit` runs just before the real `replaceState` (the status says "committing"). A flow cannot
 * be interrupted in the middle of its worker calls, so a cancel is honoured here: nothing was changed, and the flow undoes its
 * snapshot and its pending state exactly as it does for any refusal.
 */
export function guardStore(store: StoreHandle, signal: AbortSignal | undefined, onCommit: () => void): GuardedStore {
  let cancelled = false;
  let committed = false;
  return {
    getState: () => store.getState(),
    getRevision: () => store.getRevision(),
    isReadOnly: () => store.isReadOnly(),
    replaceState(state, cause, precomputed) {
      if (signal?.aborted === true) {
        cancelled = true;
        throw new FlowCancelled();
      }
      onCommit();
      committed = true;
      return store.replaceState(state, cause, precomputed);
    },
    cancelledAtCommit: () => cancelled,
    committed: () => committed,
  };
}

/**
 * Flushes the write queue and reads what happened. Saved means the queue is idle at a revision at least the one just applied.
 * A tab with no adapter saves nothing (`sessionOnly`).
 */
export async function durabilityOf(adapter: DexieAdapter | undefined, revision: number): Promise<Pick<Durability, 'saved' | 'sessionOnly' | 'save'>> {
  if (adapter === undefined) return { saved: false, sessionOnly: true, save: null };
  try {
    await adapter.flush();
  } catch {
    // a flush that rejects leaves the failure in the SaveStatus read below
  }
  const status = adapter.getStatus();
  const saved = status.state === 'saved' && status.pendingRevisions === 0 && status.lastSavedRevision >= revision;
  return { saved, sessionOnly: false, save: saved ? null : saveViewOf(status) };
}

export interface StoreRouter {
  /** What a flow is built over: reads the live store, commits through the guard of the call that is running (if any). */
  readonly port: FlowStore;
  use(guard: GuardedStore): void;
  clear(): void;
}

/** The Phase 3/4 flows keep their store for life; the guard belongs to one call (its signal, its status). The router joins the two. */
export function createStoreRouter(store: StoreHandle): StoreRouter {
  let current: GuardedStore | undefined;
  return {
    port: {
      getState: () => store.getState(),
      getRevision: () => store.getRevision(),
      isReadOnly: () => store.isReadOnly(),
      replaceState: (state, cause, precomputed) => (current ?? store).replaceState(state, cause, precomputed),
    },
    use(guard) {
      current = guard;
    },
    clear() {
      current = undefined;
    },
  };
}
