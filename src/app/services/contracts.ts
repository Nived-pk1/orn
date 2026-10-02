/**
 * Contracts of the app services (step 5.1a, E1): plain TypeScript, no React, no DOM. Everything the services need from the
 * outside world arrives in `AppEnv`; they read no global and never throw for an environment problem: the answer is a value
 * and a status. This step creates the COMPUTE client only; chem, layout and search are step 5.1b.
 */
import type { WorkerFactories } from '@/app/worker-factories';
import type { StoreHandle } from '@/core/commands';
import type { Clock, RandomSource } from '@/core/dataset/contracts';
import type { MigrationRunner } from '@/core/migrations/contracts';
import type { BootReport, BroadcastChannelFactory, DexieAdapter, LockManagerLike, OrnDbOptions, Scheduler } from '@/persistence';
import type { ReplicaSync } from '@/workers/compute';
import type { DerivedIndexes } from './derived-indexes';
import type { AppMode, EventLog, StatusStore } from './status';

export interface AppEnv {
  /** Both absent (or one): nothing can be stored, the session is session-only and says so. */
  readonly indexedDB?: OrnDbOptions['indexedDB'];
  readonly IDBKeyRange?: OrnDbOptions['IDBKeyRange'];
  /** `navigator.locks`; absent: no Web Locks, the tab is the writer and `singleTab` is set. */
  readonly locks?: LockManagerLike;
  /** Makes the change channel (`new BroadcastChannel(name)`); absent: nobody is told about a commit. */
  readonly channel?: BroadcastChannelFactory;
  /** Step 5.1a uses `compute`; the other three are taken by step 5.1b. */
  readonly workers: Pick<WorkerFactories, 'compute'> & Partial<WorkerFactories>;
  readonly clock: Clock;
  readonly random: RandomSource;
  readonly timers: Scheduler;
  readonly migrationRunner: MigrationRunner;
  /** Written into snapshots and exports (`DexieAdapterOptions.generator`). */
  readonly generator: { readonly app: string; readonly version: string };
}

export type SaveEverythingResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly code: 'NOT_NEEDED' | 'NOT_WRITER' | 'NO_STORAGE' | 'FAILED'; readonly message: string };

export type ShutdownResult =
  | { readonly written: true; readonly at: string }
  | { readonly written: false; readonly reason: 'not_writer' | 'no_storage' | 'pending_writes' | 'not_saved' | 'write_failed'; readonly message: string };

export type RetryReplicaResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface AppServices {
  /** The one canonical store of this tab. Read-only for a follower, a read-only tab and until a promotion is done. */
  readonly store: StoreHandle;
  /** ONE immutable value; its identity changes only when a field changes. */
  readonly status: StatusStore;
  /** The bounded in-memory event log (`EVENT_LOG_LIMIT`). */
  readonly log: EventLog;
  /** Full indexes at the store's revision, built lazily; callers never keep a handle (see the module header). */
  readonly indexes: DerivedIndexes;
  /** What boot found; undefined in a session-only tab. */
  readonly bootReport: BootReport | undefined;
  /** The persistence adapter; undefined in a session-only tab. Flows (5.1c) use it; the UI never does. */
  readonly persistence: DexieAdapter | undefined;
  /** The compute replica sync; undefined while none exists (it could not be created). */
  replicaSync(): ReplicaSync | undefined;
  /** Synchronous: ChangeSets accepted but not yet durable, or a failing save (for `beforeunload`). */
  pendingWrites(): boolean;
  /** `replaceAll` of the store's state; only for a `revision_gap` failure, any other state is refused as a value. */
  saveEverythingNow(): Promise<SaveEverythingResult>;
  /** A new replica sync and client loaded from the store's current state; the old ones are terminated. */
  retryReplica(): Promise<RetryReplicaResult>;
  /** Writer only, nothing pending and saved: writes the clean-shutdown marker. Always answers a value. */
  shutdown(): Promise<ShutdownResult>;
  /** Terminates the clients, stops the sync and the follower, releases the lock, closes the channel and the adapter. Safe twice. */
  dispose(): Promise<void>;
}

/** What `OpenResult` means for the app (the table of Phase 5 plan review Q6), as data. */
export interface ModeDecision {
  readonly mode: AppMode;
  readonly reason: string | null;
  readonly detail: string | null;
}
