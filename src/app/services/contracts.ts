/**
 * Contracts of the app services (step 5.1a, E1): plain TypeScript, no React, no DOM. Everything the services need from the
 * outside world arrives in `AppEnv`; they read no global and never throw for an environment problem: the answer is a value
 * and a status. Step 5.1a made the compute client; step 5.1b adds the engines (chem, L4, layout, search, depictions). Their worker
 * threads are created at their first need, never at boot (PERFORMANCE §7).
 */
import type { WorkerFactories } from '@/app/worker-factories';
import type { ChemService, L4Service } from '@/workers/chem';
import type { LayoutService } from '@/workers/layout';
import type { SearchService, SearchSync } from '@/workers/search';
import type { StoreHandle } from '@/core/commands';
import type { Clock, RandomSource } from '@/core/dataset/contracts';
import type { MigrationRunner } from '@/core/migrations/contracts';
import type { BootReport, BroadcastChannelFactory, DexieAdapter, LockManagerLike, OrnDbOptions, Scheduler } from '@/persistence';
import type { ReplicaSync } from '@/workers/compute';
import type { DepictionService } from './depiction';
import type { DraftChecksPort } from '@/features/workbench';
import type { DraftManager } from './drafts';
import type { DerivedIndexes } from './derived-indexes';
import type { Flows } from './flow-types';
import type { RetryEngineResult } from './engine-client';
import type { AppMode, EngineName, EventLog, StatusStore } from './status';

export interface AppEnv {
  /** Both absent (or one): nothing can be stored, the session is session-only and says so. */
  readonly indexedDB?: OrnDbOptions['indexedDB'];
  readonly IDBKeyRange?: OrnDbOptions['IDBKeyRange'];
  /** `navigator.locks`; absent: no Web Locks, the tab is the writer and `singleTab` is set. */
  readonly locks?: LockManagerLike;
  /** Makes the change channel (`new BroadcastChannel(name)`); absent: nobody is told about a commit. */
  readonly channel?: BroadcastChannelFactory;
  /** `compute` is required; a missing chem, layout or search factory is a status (`workers.*.state` is `absent`), not an error. */
  readonly workers: Pick<WorkerFactories, 'compute'> & Partial<WorkerFactories>;
  readonly clock: Clock;
  readonly random: RandomSource;
  readonly timers: Scheduler;
  readonly migrationRunner: MigrationRunner;
  /** Written into snapshots and exports (`DexieAdapterOptions.generator`). */
  readonly generator: { readonly app: string; readonly version: string };
  /** `navigator.storage`: asked once for persistent storage after the first successful import in a writer tab (step 5.1c). Absent: AppStatus.storage stays unknown, with the reason. */
  readonly storage?: {
    persist(): Promise<boolean>;
    /** Step 5.5d: asked at boot, without a prompt, when the dataset already has data (the answer is `refused` with its words when it is false). */
    persisted?(): Promise<boolean>;
  };
}

export type SaveEverythingResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly code: 'NOT_NEEDED' | 'NOT_WRITER' | 'NO_STORAGE' | 'FAILED'; readonly message: string };

export type ShutdownResult =
  | { readonly written: true; readonly at: string }
  | { readonly written: false; readonly reason: 'not_writer' | 'no_storage' | 'pending_writes' | 'not_saved' | 'write_failed'; readonly message: string };

/** `resume()`: the session goes on after a `shutdown()` (a page restored from the back/forward cache, or a commit after it). */
export type ResumeResult =
  | { readonly resumed: true }
  | { readonly resumed: false; readonly reason: 'not_writer' | 'no_storage' | 'not_shut_down' | 'write_failed'; readonly message: string };

export type RetryReplicaResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface AppServices {
  /** The one canonical store of this tab. Read-only for a follower, a read-only tab and until a promotion is done. */
  readonly store: StoreHandle;
  /** ONE immutable value; its identity changes only when a field changes. */
  readonly status: StatusStore;
  /** The bounded in-memory event log (`EVENT_LOG_LIMIT`). */
  readonly log: EventLog;
  /** Adds one line to the event log as source "app" (step 5.5a, additive): how the UI leaves a trace; nothing is silent. */
  logApp(type: string, message: string): void;
  /** Full indexes at the store's revision, built lazily; callers never keep a handle (see the module header). */
  readonly indexes: DerivedIndexes;
  /** What boot found; undefined in a session-only tab. */
  readonly bootReport: BootReport | undefined;
  /** The persistence adapter; undefined in a session-only tab. The flows use it; the UI never does. */
  readonly persistence: DexieAdapter | undefined;
  /** The compute replica sync; undefined while none exists (it could not be created). */
  replicaSync(): ReplicaSync | undefined;
  /** Structure parsing, depiction and the batch checks. Every call answers a value; "unavailable" and "timeout" are answers. */
  readonly chem: ChemService;
  /** The L4 checks: per-subject status, derived formulas, summary. Feed and control belong to the services (`retryEngine`). */
  readonly l4: Pick<L4Service, 'statusOf' | 'subscribe' | 'subscribeFormulas' | 'derivedFormulaOf' | 'summary' | 'flush' | 'stats'>;
  /** Layout over the layout worker, with the warm-up gate; a fallback layout or a note is reported in the log and `layoutNotice`. */
  readonly layout: LayoutService;
  /** Search queries (a newer query on the same channel supersedes the older). The index is kept by the services. */
  readonly search: Pick<SearchService, 'search' | 'superseded'>;
  /** The search sync, for tests and diagnostics; undefined when the environment has no search worker. */
  searchSync(): SearchSync | undefined;
  /** Resolves when no automatic snapshot is being made (tests and diagnostics; the writer tab only, else at once). */
  snapshotsIdle(): Promise<void>;
  /** Sanitised SVG text for a structure: at most 4 calls in flight, cancellable, memory LRU. No object URLs here. */
  readonly depictions: DepictionService;
  /**
   * The user asked to try an engine again (AppStatus shows it `unavailable` with its message): back to cold and one load now. Never
   * called by a timer. After a successful chem retry every structure is checked again. Answers a value.
   */
  retryEngine(name: EngineName): Promise<RetryEngineResult>;
  /**
   * Import (preview, revise, cancel, apply, Undo import), restore of a snapshot by id, and export (step 5.1c). Plain async functions
   * answering values; one whole-state operation at a time (`AppStatus.operation`); apply and restore answer only after `flush()`.
   */
  readonly flows: Flows;
  /** The live panel's checks of a draft (step 6.2a): L1-L3 dry run in the compute worker, L4 of the structure in the chem worker. */
  readonly draftChecks: DraftChecksPort;
  /** The editor sessions (ADR-040): open drafts in memory, kept in storage by a 2 s throttle, offered again at the next boot. */
  readonly drafts: DraftManager;
  /** Synchronous: ChangeSets accepted but not yet durable, or a failing save (for `beforeunload`). */
  pendingWrites(): boolean;
  /** `replaceAll` of the store's state; only for a `revision_gap` failure, any other state is refused as a value. */
  saveEverythingNow(): Promise<SaveEverythingResult>;
  /** A new replica sync and client loaded from the store's current state; the old ones are terminated. */
  retryReplica(): Promise<RetryReplicaResult>;
  /** Writer only, nothing pending and saved: writes the clean-shutdown marker. Always answers a value. */
  shutdown(): Promise<ShutdownResult>;
  /**
   * Marks the session as running again (writes the clean-shutdown marker `null`). Called on `pageshow` with `persisted = true`; a
   * ChangeSet accepted after `shutdown()` does the same by itself, so the marker never outlives a session that goes on (5.1a review).
   * Nothing to do (`not_shut_down`) when this session wrote no marker.
   */
  resume(): Promise<ResumeResult>;
  /** Terminates the clients, stops the sync and the follower, releases the lock, closes the channel and the adapter. Safe twice. */
  dispose(): Promise<void>;
}

/** What `OpenResult` means for the app (the table of Phase 5 plan review Q6), as data. */
export interface ModeDecision {
  readonly mode: AppMode;
  readonly reason: string | null;
  readonly detail: string | null;
}
