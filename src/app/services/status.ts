/**
 * AppStatus (step 5.1a, E9): ONE immutable value with `get()` and `subscribe()`, the shape React reads with
 * `useSyncExternalStore` (step 5.1d). Its identity changes only when a field's VALUE changes, so a subscriber is never told
 * about an unchanged status and a selector on `get()` never sees a new object for nothing. Also the bounded in-memory event
 * log (worker, follower and persistence events plus the services' own notes).
 */
import type { PersistenceEvent } from '@/persistence';
import type { WorkerEvent } from '@/workers/rpc/contracts';

export type AppMode = 'writer' | 'follower' | 'read_only' | 'session_only';

export interface SaveView {
  readonly state: 'saved' | 'saving' | 'retrying' | 'failed' | 'read_only';
  readonly lastSavedRevision: number;
  readonly pendingRevisions: number;
  readonly lastError: string | null;
  readonly failureReason: 'revision_gap' | null;
  readonly deletablePeriodicSnapshotIds: readonly string[];
}

export interface ReplicaView {
  /** `absent`: no replica sync exists (it could not be created, or boot has not made one yet). */
  readonly state: 'absent' | 'in_sync' | 'reloading' | 'down';
  readonly reason: string;
  readonly revision: number | null;
}

export type WorkerName = 'chem' | 'layout' | 'search';
export type EngineName = 'chem' | 'layout';

/**
 * One engine worker (chem, layout, search; the compute worker is `replica`). `absent`: the environment gave no factory (a status,
 * not an error). `started`: the thread exists (workers are created at their FIRST NEED, PERFORMANCE §7). `restarting`: crashed or
 * timed out, the client has started a new one and its restart hook is running. `down`: gave up (restart cap, or no thread could be made).
 */
export interface WorkerView {
  readonly state: 'absent' | 'ok' | 'restarting' | 'down';
  readonly started: boolean;
  readonly reason: string;
}

/** The engine inside a worker (RDKit WASM, ELK): `cold` until the first real call, `unavailable` with the worker's message until a Retry. */
export interface EngineView {
  readonly state: 'cold' | 'loading' | 'ready' | 'unavailable';
  readonly message: string | null;
}

/** The L4 chemistry checks. `unavailable`: the engine cannot answer, so nothing is claimed about the structures. */
export interface L4View {
  readonly state: 'idle' | 'checking' | 'unavailable';
  /** Records the toolkit did not answer for; they are NOT clean (said out loud, never CHEM-001). */
  readonly notChecked: number;
  /** Records waiting or being checked. */
  readonly queued: number;
  readonly message: string | null;
}

/** The search index sync and its warm-boot cache. */
export interface SearchView {
  readonly state: 'absent' | 'idle' | 'pending' | 'down';
  readonly indexRevision: number | null;
  /** How the worker's index got its documents at boot: nothing yet, one full load, or the cache. */
  readonly loadedFrom: 'none' | 'full_load' | 'warm_cache';
  readonly reason: string;
  /** The last cache write: none yet, saved (with the revision), or refused (a status, never an error). */
  readonly cache: { readonly state: 'none' | 'saved' | 'refused'; readonly revision: number | null; readonly message: string | null };
}

/** What boot found, for the one-line notices of step 5.1d (nothing silent, CLAUDE.md §1.5). */
export interface BootNotices {
  readonly crashSuspected: boolean;
  readonly quarantinedRows: number;
  readonly assetsWithoutBytes: number;
  readonly unverifiedAssetBlobs: number;
  readonly migrationSteps: number;
}

/** The whole-state operations of step 5.1c. One runs at a time (`flow-gate.ts`). */
export type OperationKind = 'import_preview' | 'import_apply' | 'restore' | 'export';

/** What the running operation is doing now; `progress` is null until the operation reports any. */
export interface OperationView {
  readonly kind: OperationKind;
  readonly stage: string;
  readonly progress: { readonly done: number; readonly total: number | null } | null;
}

/** Persistent storage (`navigator.storage.persist()`), asked once after the first successful import in a writer tab. */
export interface StorageView {
  /** `unknown`: not asked yet, or the environment could not answer (`message` says which). `refused` is an answer, not an error. */
  readonly persistence: 'unknown' | 'persisted' | 'refused';
  readonly message: string | null;
}

export interface AppStatus {
  readonly stage: 'booting' | 'ready' | 'disposed';
  /** null until boot has decided. */
  readonly mode: AppMode | null;
  /** Why the mode is what it is: a read-only reason, why nothing is saved, or why a promotion was refused. */
  readonly reason: string | null;
  readonly detail: string | null;
  /** No Web Locks here: nothing stops a second writer tab (PERSISTENCE §10). */
  readonly singleTab: boolean;
  /** null: nothing is saved in this session (session-only). */
  readonly save: SaveView | null;
  readonly replica: ReplicaView;
  /** Where the last whole-state validation ran (`main` with its reason is a fallback); null before boot. */
  readonly validation: { readonly where: 'worker' | 'main' | 'none'; readonly reason: string } | null;
  readonly promotion: 'not_applicable' | 'waiting' | 'promoted' | 'refused';
  /** The last full reload a follower could not do; cleared by the next one that works. */
  readonly reloadFailure: { readonly reason: string; readonly detail: string } | null;
  /** Rows a follower met that fail L1 (never applied, never quarantined by a follower). */
  readonly rejectedRows: number;
  /** Full reloads a follower has done. */
  readonly followerReloads: number;
  readonly notices: BootNotices | null;
  readonly workers: { readonly chem: WorkerView; readonly layout: WorkerView; readonly search: WorkerView };
  readonly engines: { readonly chem: EngineView; readonly layout: EngineView };
  readonly l4: L4View;
  readonly search: SearchView;
  /** The last layout notice: a fallback layout (with its reason) or a note the layout service made; null when there was none. */
  readonly layoutNotice: string | null;
  /** The whole-state operation that is running (import preview or apply, restore, export); null when none. */
  readonly operation: OperationView | null;
  readonly storage: StorageView;
}

export const INITIAL_STATUS: AppStatus = Object.freeze({
  stage: 'booting',
  mode: null,
  reason: null,
  detail: null,
  singleTab: false,
  save: null,
  replica: Object.freeze({ state: 'absent', reason: 'not started', revision: null }),
  validation: null,
  promotion: 'not_applicable',
  reloadFailure: null,
  rejectedRows: 0,
  followerReloads: 0,
  notices: null,
  workers: Object.freeze({
    chem: Object.freeze({ state: 'absent', started: false, reason: 'not started' }),
    layout: Object.freeze({ state: 'absent', started: false, reason: 'not started' }),
    search: Object.freeze({ state: 'absent', started: false, reason: 'not started' }),
  }),
  engines: Object.freeze({ chem: Object.freeze({ state: 'cold', message: null }), layout: Object.freeze({ state: 'cold', message: null }) }),
  l4: Object.freeze({ state: 'idle', notChecked: 0, queued: 0, message: null }),
  search: Object.freeze({ state: 'absent', indexRevision: null, loadedFrom: 'none', reason: 'not started', cache: Object.freeze({ state: 'none', revision: null, message: null }) }),
  layoutNotice: null,
  operation: null,
  storage: Object.freeze({ persistence: 'unknown', message: null }),
});

export interface StatusStore {
  get(): AppStatus;
  /** Called with the new value after every change; returns the unsubscribe function. */
  subscribe(listener: (status: AppStatus) => void): () => void;
}

export interface StatusWriter extends StatusStore {
  /** Merges the patch. Returns true when a field's value changed (and listeners were told), false when nothing did. */
  update(patch: Partial<AppStatus>): boolean;
  /** Removes every listener. */
  clear(): void;
}

/** Structural equality of the plain values a status holds (primitives, arrays, plain objects). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export function createStatusStore(onListenerError: (error: unknown) => void): StatusWriter {
  let current: AppStatus = INITIAL_STATUS;
  const listeners = new Set<(status: AppStatus) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    update(patch) {
      const keys = Object.keys(patch) as (keyof AppStatus)[];
      const changed = keys.filter((key) => !sameValue(current[key], patch[key]));
      if (changed.length === 0) return false;
      const next = { ...current } as Record<string, unknown>;
      for (const key of changed) next[key] = deepFreeze(patch[key]);
      current = Object.freeze(next) as unknown as AppStatus;
      for (const listener of [...listeners]) {
        try {
          listener(current);
        } catch (error) {
          onListenerError(error);
        }
      }
      return true;
    },
    clear() {
      listeners.clear();
    },
  };
}

/** The event log keeps this many entries; older ones are dropped and counted in `dropped()`. */
export const EVENT_LOG_LIMIT = 200;

type LogInput =
  | { readonly source: 'worker'; readonly event: WorkerEvent }
  | { readonly source: 'persistence'; readonly event: PersistenceEvent }
  | { readonly source: 'follower' | 'app'; readonly event: { readonly type: string; readonly message: string } };

export type AppLogEntry = { readonly seq: number; readonly atMs: number } & LogInput;

export interface EventLog {
  /** The entries, oldest first. The same array until the next entry is added. */
  get(): readonly AppLogEntry[];
  /** How many entries the ring has dropped (the log is bounded, never silently: this says how many). */
  dropped(): number;
  subscribe(listener: () => void): () => void;
}

export interface EventLogWriter extends EventLog {
  add(entry: LogInput): void;
  clear(): void;
}

export function createEventLog(nowMs: () => number, limit: number = EVENT_LOG_LIMIT): EventLogWriter {
  let entries: readonly AppLogEntry[] = Object.freeze([]);
  let seq = 0;
  let dropped = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => entries,
    dropped: () => dropped,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    add(entry) {
      seq += 1;
      const next = [...entries, Object.freeze({ seq, atMs: nowMs(), ...entry }) as AppLogEntry];
      if (next.length > limit) {
        dropped += next.length - limit;
        next.splice(0, next.length - limit);
      }
      entries = Object.freeze(next);
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch {
          // a log listener that throws must not stop the log
        }
      }
    },
    clear() {
      listeners.clear();
    },
  };
}
