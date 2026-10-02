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

/** What boot found, for the one-line notices of step 5.1d (nothing silent, CLAUDE.md §1.5). */
export interface BootNotices {
  readonly crashSuspected: boolean;
  readonly quarantinedRows: number;
  readonly assetsWithoutBytes: number;
  readonly unverifiedAssetBlobs: number;
  readonly migrationSteps: number;
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
