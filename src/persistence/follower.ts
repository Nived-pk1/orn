/**
 * The follower tab (docs/PERSISTENCE.md §10, ADR-033). A tab that did not get the writer lock follows the writer:
 * for each message on the change channel it re-reads the changed rows in ONE read transaction, L1-parses them and
 * hands them to `store.applyRemote`; in any doubt (a gap in revisions, a database that moved on, a row that fails L1,
 * a store that refuses) it reloads everything with `store.reload`. When the writer goes away it is promoted: the
 * write queue becomes writable and boot runs again as the writer, then the store reloads, and only then is the tab
 * writable. A follower NEVER writes (INV-28): it has no write queue attached, and it never quarantines.
 *
 * Messages are handled strictly one at a time, in order, with a bounded backlog (beyond it: one full reload).
 */
import type { CommitResult, PrecomputedFindings, RemoteChange } from '@/core/commands/contracts';
import { checkPrecomputed, recordCountsOf } from '@/core/commands/precomputed';
import { jsonEqual } from '@/core/commands/lookup';
import { DatasetMetaSchema, type AnyRecord, type CanonicalState, type RecordKind } from '@/core/schema';
import { validator } from '@/core/validation';
import { capIssues, issueOf } from './boot-load';
import { parseChangeMessage } from './change-message';
import type { BootReport, ChangeChannel, ChangeMessage, OpenResult, WriterLock } from './contracts';
import { describeError } from './events';
import type { ChangedRows, FollowerLoad } from './follower-read';

/** More unhandled messages than this are dropped and replaced by one full reload. */
export const MAX_FOLLOWER_BACKLOG = 100;
const MAX_REPORTED_REJECTS = 20;

/** The part of the adapter a follower uses. */
export interface FollowerAdapter {
  readChanged(ids: readonly string[]): Promise<ChangedRows>;
  loadForFollower(): Promise<FollowerLoad>;
  promote(): Promise<OpenResult>;
  setReadOnly(readOnly: boolean): void;
}

/** The part of the canonical store a follower uses (`StoreHandle` satisfies it). */
export interface FollowerStore {
  getState(): CanonicalState;
  getRevision(): number;
  applyRemote(change: RemoteChange): CommitResult;
  reload(next: CanonicalState, revision: number, precomputed?: PrecomputedFindings): CommitResult;
}

export type ReloadReason = 'no_state' | 'gap' | 'everything' | 'database_moved' | 'invalid_row' | 'invalid_meta' | 'stale' | 'store_failed' | 'backlog';

export type FollowerEvent =
  | { readonly type: 'applied'; readonly revision: number; readonly changed: number }
  | { readonly type: 'reloaded'; readonly reason: ReloadReason; readonly revision: number; readonly rejectedRows: number }
  /**
   * A full read succeeded while no store is attached: build one (`readOnly: follower.isReadOnly`, `precomputed` when present), then
   * `attach` it.
   */
  | { readonly type: 'loaded'; readonly reason: ReloadReason; readonly state: CanonicalState; readonly revision: number; readonly rejectedRows: number; readonly precomputed?: PrecomputedFindings }
  /** A full reload could not use the validation port (or its findings were refused) and validated in this thread instead (step 4.2d). */
  | { readonly type: 'validation_fallback'; readonly reason: string }
  /** A stored row failed L1: not applied (a follower never quarantines); the writer's next boot or promotion moves it. */
  | { readonly type: 'row_rejected'; readonly id: string; readonly issues: readonly string[] }
  | { readonly type: 'reload_failed'; readonly reason: string; readonly detail: string }
  | { readonly type: 'message_ignored'; readonly reason: 'malformed' | 'old' }
  | { readonly type: 'apply_refused'; readonly code: string; readonly message: string }
  /** Writable now. `bootReport` is what boot found as the writer (a crashed old writer, quarantined rows, migration steps). */
  | { readonly type: 'promoted'; readonly state: CanonicalState | null; readonly revision: number; readonly bootReport: BootReport | undefined; readonly quarantinedCount: number }
  | { readonly type: 'promotion_failed'; readonly reason: string; readonly detail: string }
  | { readonly type: 'error'; readonly message: string };

export interface FollowerOptions {
  readonly adapter: FollowerAdapter;
  /** Absent: the follower cannot hear the writer (no BroadcastChannel); it still promotes. */
  readonly channel?: ChangeChannel;
  /** The lock `acquire()` answered `held_elsewhere` for: `whenAcquired` resolving is the promotion. */
  readonly lock: WriterLock;
  /** The store, if the boot result had a state; otherwise `attach` it after the first `loaded` event. */
  readonly store?: FollowerStore;
  /** Revision of the state the store (or the boot result) holds; null when there is none yet. */
  readonly revision: number | null;
  /** The schema version this app writes; rows of another version are never applied incrementally. */
  readonly schemaVersion: number;
  readonly onEvent?: (event: FollowerEvent) => void;
  /**
   * L1-L3 findings of a state a full reload just read, computed elsewhere (the compute worker's `BootReplica.validate`, step 4.2d):
   * `store.reload(state, revision, precomputed)` then builds indexes only. Absent, rejected or refused: this thread validates, and a
   * `validation_fallback` event says so.
   */
  readonly validate?: (state: CanonicalState, revision: number) => Promise<PrecomputedFindings>;
}

export interface Follower {
  /** True until promoted. Hand it to the store: `createCanonicalStore({ readOnly: follower.isReadOnly })`. */
  readonly isReadOnly: () => boolean;
  attach(store: FollowerStore): void;
  /** Resolves when nothing is being handled and nothing is waiting (tests, and a caller that must see the state settle). */
  idle(): Promise<void>;
  subscribe(listener: (event: FollowerEvent) => void): () => void;
  /** Stops following and abandons the wait for the lock. */
  close(): Promise<void>;
}

export function createFollower(options: FollowerOptions): Follower {
  const { adapter } = options;
  const listeners = new Set<(event: FollowerEvent) => void>();
  if (options.onEvent !== undefined) listeners.add(options.onEvent);
  let store = options.store;
  let revision = options.revision;
  let readOnly = true;
  let promoting = false;
  let closed = false;
  let needsReload: ReloadReason | undefined;
  const backlog: ChangeMessage[] = [];
  let running: Promise<void> = Promise.resolve();

  const emit = (event: FollowerEvent): void => {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // A listener's failure must not stop the follower.
      }
    }
  };
  const guarded = (task: () => Promise<void>): void => {
    running = running.then(task).catch((error: unknown) => emit({ type: 'error', message: describeError(error) }));
  };

  /** The findings the validation port computed for a full read, or undefined (no port, it failed, or its answer is wrong: said, never silent). */
  async function validated(state: CanonicalState, at: number): Promise<PrecomputedFindings | undefined> {
    if (options.validate === undefined) return undefined;
    let why: string;
    try {
      const answer = await options.validate(state, at);
      const problem = checkPrecomputed(state, at, answer);
      if (problem === undefined) return answer;
      why = `the validation port's findings were refused (${problem.message})`;
    } catch (error) {
      why = `the validation port could not validate (${describeError(error)})`;
    }
    emit({ type: 'validation_fallback', reason: `${why}; validating in this thread instead` });
    return undefined;
  }

  /** A full read. On success adopt it (store attached) or announce it (no store); on failure keep what we have. */
  async function reload(reason: ReloadReason): Promise<void> {
    const loaded = await adapter.loadForFollower();
    if (!loaded.ok) {
      emit({ type: 'reload_failed', reason: loaded.reason, detail: loaded.detail });
      return;
    }
    for (const rejected of loaded.rejected.slice(0, MAX_REPORTED_REJECTS)) emit({ type: 'row_rejected', ...rejected });
    const precomputed = await validated(loaded.state, loaded.revision);
    if (store === undefined) {
      revision = loaded.revision;
      emit({ type: 'loaded', reason, state: loaded.state, revision: loaded.revision, rejectedRows: loaded.rejected.length, ...(precomputed === undefined ? {} : { precomputed }) });
      return;
    }
    let result = store.reload(loaded.state, loaded.revision, precomputed);
    if (!result.ok && result.error.code === 'FINDINGS_MISMATCH' && precomputed !== undefined) {
      emit({ type: 'validation_fallback', reason: `the store refused the validation port's findings (${result.error.message}); validating in this thread instead` });
      result = store.reload(loaded.state, loaded.revision);
    }
    if (!result.ok) {
      emit({ type: 'reload_failed', reason: result.error.code, detail: result.error.message });
      return;
    }
    revision = loaded.revision;
    emit({ type: 'reloaded', reason, revision: loaded.revision, rejectedRows: loaded.rejected.length });
  }

  async function handle(message: ChangeMessage): Promise<void> {
    if (message.changedIds === 'all') {
      if (revision !== null && message.revision < revision) return void emit({ type: 'message_ignored', reason: 'old' });
      return reload('everything');
    }
    if (revision !== null && message.revision <= revision) return void emit({ type: 'message_ignored', reason: 'old' });
    if (revision === null || store === undefined) return reload('no_state');
    if (message.fromRevision !== revision) return reload('gap');

    const ids = message.changedIds;
    const read = await adapter.readChanged(ids);
    if (read.revision !== message.revision || read.schemaVersion !== options.schemaVersion) return reload('database_moved');
    const upserts: AnyRecord[] = [];
    const deletedIds: string[] = [];
    for (const [i, id] of ids.entries()) {
      const row = read.rows[i];
      if (row === undefined) {
        deletedIds.push(id);
        continue;
      }
      const kind = typeof row === 'object' && row !== null ? (row as { kind?: unknown }).kind : undefined;
      const parsed = validator.parseRecord(kind as RecordKind, row);
      if (!parsed.ok) {
        emit({ type: 'row_rejected', id, issues: capIssues(parsed.findings.map(issueOf)) });
        return reload('invalid_row');
      }
      upserts.push(parsed.record);
    }
    const meta = DatasetMetaSchema.safeParse(read.datasetMeta);
    if (!meta.success) return reload('invalid_meta');
    const change: RemoteChange = {
      fromRevision: message.fromRevision,
      revision: message.revision,
      upserts,
      deletedIds,
      ...(jsonEqual(meta.data, store.getState().meta) ? {} : { meta: meta.data }),
    };
    const result = store.applyRemote(change);
    if (result.ok) {
      revision = message.revision;
      emit({ type: 'applied', revision, changed: upserts.length + deletedIds.length });
    } else if (result.error.code === 'STALE_REVISION') {
      await reload('stale');
    } else if (result.error.code === 'INTERNAL') {
      await reload('store_failed');
    } else {
      emit({ type: 'apply_refused', code: result.error.code, message: result.error.message });
    }
  }

  async function drain(): Promise<void> {
    for (;;) {
      if (closed || promoting || !readOnly) return;
      if (needsReload !== undefined) {
        const reason = needsReload;
        needsReload = undefined;
        await reload(reason);
        continue;
      }
      const next = backlog.shift();
      if (next === undefined) return;
      await handle(next);
    }
  }

  const unsubscribeChannel = options.channel?.subscribe((raw) => {
    if (closed || promoting || !readOnly) return;
    const message = parseChangeMessage(raw);
    if (message === undefined) return emit({ type: 'message_ignored', reason: 'malformed' });
    if (backlog.length >= MAX_FOLLOWER_BACKLOG) {
      backlog.length = 0;
      needsReload = 'backlog';
    } else {
      backlog.push(message);
    }
    guarded(drain);
  });

  async function fail(reason: string, detail: string): Promise<void> {
    adapter.setReadOnly(true);
    await options.lock.release();
    emit({ type: 'promotion_failed', reason, detail });
  }

  /** Promotion = boot again as the writer (queue writable), reload the store, THEN become writable. */
  async function promote(): Promise<void> {
    backlog.length = 0;
    needsReload = undefined;
    const opened = await adapter.promote();
    if (opened.mode !== 'read_write') {
      // Boot refused (newer schema, failed migration, damaged meta) and gave the lock back; keep following read-only.
      promoting = false;
      emit({ type: 'promotion_failed', reason: opened.mode === 'unavailable' ? opened.reason : (opened.readOnlyReason ?? 'read_only'), detail: opened.detail ?? 'the database could not be opened as the writer' });
      return;
    }
    if (store !== undefined) {
      if (opened.state === null) {
        // An empty database and a store that holds no record: nothing is lost, the tab becomes an empty writer. Records in the store
        // with an empty database are refused (INV-28 guards unchanged: the write queue is attached only after this check).
        const held = Object.values(recordCountsOf(store.getState())).reduce((sum, n) => sum + n, 0);
        if (held > 0) return fail('state_missing', 'the database holds no data although this tab had some');
        readOnly = false;
        revision = opened.revision;
        unsubscribeChannel?.();
        emit({ type: 'promoted', state: null, revision: opened.revision, bootReport: opened.bootReport, quarantinedCount: opened.quarantinedCount });
        return;
      }
      // Boot (the promotion's) validated the state through the same port, so its findings are the ones the store checks and adopts.
      let result = store.reload(opened.state, opened.revision, opened.bootReport?.precomputed);
      if (!result.ok && result.error.code === 'FINDINGS_MISMATCH' && opened.bootReport?.precomputed !== undefined) {
        emit({ type: 'validation_fallback', reason: `the store refused the promotion's findings (${result.error.message}); validating in this thread instead` });
        result = store.reload(opened.state, opened.revision);
      }
      if (!result.ok) return fail(result.error.code, result.error.message);
    }
    readOnly = false;
    revision = opened.revision;
    unsubscribeChannel?.();
    emit({ type: 'promoted', state: opened.state, revision: opened.revision, bootReport: opened.bootReport, quarantinedCount: opened.quarantinedCount });
  }

  void options.lock.whenAcquired().then(() => {
    if (closed) return;
    promoting = true; // stop taking messages; what is in flight finishes first (the chain), then promotion runs
    guarded(promote);
  });

  return {
    isReadOnly: () => readOnly,
    attach(next) {
      store = next;
      revision = next.getRevision();
    },
    async idle() {
      let seen: Promise<void>;
      do {
        seen = running;
        await seen;
      } while (seen !== running);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async close() {
      closed = true;
      unsubscribeChannel?.();
      await options.lock.release();
    },
  };
}
