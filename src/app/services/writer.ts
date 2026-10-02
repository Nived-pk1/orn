/**
 * The writer side of the app services (step 5.1a): the write queue attached to the store (never to a follower's, INV-28),
 * SaveStatus mirrored into AppStatus, "save everything now" for a revision gap, `pendingWrites()` and the clean-shutdown
 * marker. All answers are values; nothing here throws for a storage problem.
 */
import type { StoreHandle } from '@/core/commands';
import type { IdFactory } from '@/core/dataset/contracts';
import { attachWriteQueue, type DexieAdapter, type SaveStatus, type WriteWiring } from '@/persistence';
import type { SaveEverythingResult, ShutdownResult } from './contracts';
import type { EventLogWriter, SaveView, StatusWriter } from './status';

export interface WriterPart {
  /** Attaches the write queue to the store: after a writer boot and after a promotion, never for a follower. */
  attach(): WriteWiring;
  pendingWrites(): boolean;
  saveEverythingNow(): Promise<SaveEverythingResult>;
  shutdown(): Promise<ShutdownResult>;
  /** The adapter's save state as the status shows it; null when nothing is saved in this session. */
  currentSave(): SaveView | null;
  /** Detaches the write queue and stops mirroring SaveStatus. */
  stop(): void;
}

export interface WriterPartOptions {
  readonly store: StoreHandle;
  readonly adapter: DexieAdapter | undefined;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
  readonly ids: IdFactory;
}

export const saveViewOf = (status: SaveStatus): SaveView => ({
  state: status.state,
  lastSavedRevision: status.lastSavedRevision,
  pendingRevisions: status.pendingRevisions,
  lastError: status.lastError ?? null,
  failureReason: status.failureReason ?? null,
  deletablePeriodicSnapshotIds: status.deletablePeriodicSnapshotIds ?? [],
});

const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function createWriterPart(options: WriterPartOptions): WriterPart {
  const { store, adapter, status, log, ids } = options;
  let wiring: WriteWiring | undefined;
  let stopMirror: (() => void) | undefined;
  if (adapter !== undefined) {
    status.update({ save: saveViewOf(adapter.getStatus()) });
    // While a follower's promotion is unresolved the adapter's state passes through writable (the promotion boots as the writer);
    // the tab is read-only until the outcome is known, so the status must not say otherwise, even for a moment.
    stopMirror = adapter.subscribeStatus((next) => {
      if (status.get().promotion === 'waiting') return;
      status.update({ save: saveViewOf(next) });
    });
  }

  const pendingWrites = (): boolean => {
    if (adapter === undefined) return false;
    const save = adapter.getStatus();
    return save.pendingRevisions > 0 || save.state === 'saving' || save.state === 'retrying' || save.state === 'failed';
  };

  return {
    attach() {
      if (adapter === undefined) return { ok: false, reason: 'read_only', message: 'nothing is saved in this session, so there is no write queue' };
      if (wiring?.ok) wiring.detach();
      wiring = attachWriteQueue(store, adapter, {
        onError: (error) => log.add({ source: 'app', event: { type: 'write_refused', message: `the write queue refused a ChangeSet (${describe(error)})` } }),
      });
      if (!wiring.ok) log.add({ source: 'app', event: { type: 'write_queue_refused', message: wiring.message } });
      return wiring;
    },

    pendingWrites,

    currentSave: () => (adapter === undefined ? null : saveViewOf(adapter.getStatus())),

    async saveEverythingNow() {
      if (adapter === undefined) return { ok: false, code: 'NO_STORAGE', message: 'nothing is saved in this session' };
      if (status.get().mode !== 'writer') return { ok: false, code: 'NOT_WRITER', message: 'only the writer tab saves' };
      const save = adapter.getStatus();
      if (save.state !== 'failed' || save.failureReason !== 'revision_gap') {
        return { ok: false, code: 'NOT_NEEDED', message: `nothing to recover: the save state is ${save.state}${save.failureReason === undefined ? '' : ` (${save.failureReason})`}` };
      }
      const state = store.getState();
      const revision = store.getRevision();
      try {
        await adapter.replaceAll(state, revision);
        log.add({ source: 'app', event: { type: 'saved_everything', message: `the whole state was saved at revision ${revision}` } });
        return { ok: true, revision };
      } catch (error) {
        const message = `saving everything failed (${describe(error)})`;
        log.add({ source: 'app', event: { type: 'save_everything_failed', message } });
        return { ok: false, code: 'FAILED', message };
      }
    },

    async shutdown() {
      const refuse = (reason: Extract<ShutdownResult, { written: false }>['reason'], message: string): ShutdownResult => ({ written: false, reason, message });
      if (adapter === undefined) return refuse('no_storage', 'nothing is saved in this session');
      if (status.get().mode !== 'writer') return refuse('not_writer', 'only the writer tab writes the marker');
      if (pendingWrites()) return refuse('pending_writes', 'writes are pending, so this is not a clean shutdown');
      const save = adapter.getStatus();
      if (save.state !== 'saved') return refuse('not_saved', `the save state is ${save.state}`);
      try {
        const at = ids.now();
        await adapter.setLastCleanShutdownAt(at);
        return { written: true, at };
      } catch (error) {
        const message = `the clean-shutdown marker could not be written (${describe(error)})`;
        log.add({ source: 'app', event: { type: 'shutdown_marker_failed', message } });
        return refuse('write_failed', message);
      }
    },

    stop() {
      if (wiring?.ok) wiring.detach();
      wiring = undefined;
      stopMirror?.();
      stopMirror = undefined;
    },
  };
}
