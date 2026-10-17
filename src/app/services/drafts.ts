/**
 * The session manager (step 6.1a part 3, ADR-040). Writer tab only: it holds the open editor sessions in memory and keeps every unfinished
 * one in the `editorSessions` store, so a draft survives a reload, a crash and a closed tab WITHOUT an unload-time write.
 *  - A dirty session is saved at most every 2 s: a throttle (the timer starts at the first edit and is not restarted by later edits), so
 *    steady typing still saves. Saves go through `saveEditorSession` (the write queue's order). `flush()` saves at once (the page hides:
 *    best effort, nothing depends on it).
 *  - Bounds: at most 20 stored sessions; a row over 1 MB of JSON is not saved and the session says so.
 *  - One session per record: opening the editor for a record that has a session reopens it, with its local undo history.
 *  - Stored rows are untrusted (`parseStoredSession`): a row that fails is listed as unreadable with Discard and never deleted without the
 *    user; its raw value stays in storage until then.
 *  - A read-only (follower) tab opens nothing; a session-only tab edits in memory and says drafts are not kept.
 * Every answer is a value; nothing here throws for a storage problem.
 */
import {
  canRedoDraft,
  canUndoDraft,
  commitDraft,
  editDraft,
  openSession,
  parseStoredSession,
  redoDraft,
  sameValue,
  undoDraft,
} from '@/core/editing';
import type { CanonicalStore, EditorSession } from '@/core/commands';
import type { IdFactory } from '@/core/dataset/contracts';
import type { AnyRecord, RecordRef } from '@/core/schema';
import type { DexieAdapter, Scheduler } from '@/persistence';
import {
  DRAFT_SAVE_INTERVAL_MS,
  MAX_DRAFT_ROW_BYTES,
  MAX_STORED_DRAFTS,
  type DraftEntry,
  type DraftListItem,
  type DraftManager,
  type DraftSaveState,
  type DraftsView,
  type OpenDraftResult,
  type UnreadableDraft,
} from './drafts-types';
import type { EventLogWriter, StatusWriter } from './status';

export * from './drafts-types';

export interface DraftManagerOptions {
  readonly store: CanonicalStore;
  readonly adapter: DexieAdapter | undefined;
  readonly status: StatusWriter;
  readonly timers: Scheduler;
  readonly ids: IdFactory;
  readonly log: EventLogWriter;
}

interface Slot {
  session: EditorSession;
  /** The session has an edit or is a stored row (a pristine open one is dropped on release). */
  edited: boolean;
  save: DraftSaveState;
  cancelTimer: (() => void) | undefined;
  saving: Promise<void> | undefined;
  removed: boolean;
  entry: DraftEntry;
}

const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));
const targetKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;
const byteLength = (text: string): number => new TextEncoder().encode(text).length;

export function createDraftManager(options: DraftManagerOptions): DraftManager {
  const { store, adapter, status, timers, ids, log } = options;
  const slots = new Map<string, Slot>();
  const unreadable = new Map<string, string>();
  const listeners = new Set<() => void>();
  let loaded = adapter === undefined; // nothing to read in a session-only tab
  let cached: DraftsView | undefined;
  let disposed = false;

  const keepingNow = (): DraftsView['keeping'] => {
    const mode = status.get().mode;
    if (mode === 'follower' || mode === 'read_only') return 'read_only';
    return adapter === undefined ? 'memory' : 'stored';
  };
  const writable = (): boolean => {
    const mode = status.get().mode;
    return mode === 'writer' || mode === 'session_only';
  };

  const makeEntry = (slot: Slot): DraftEntry => ({
    id: slot.session.id,
    session: slot.session,
    save: slot.save,
    canUndo: canUndoDraft(slot.session),
    canRedo: canRedoDraft(slot.session),
  });
  const nameOfSession = (session: EditorSession): string => {
    const names = (session.draft as { names?: { canonical?: unknown } } | null)?.names;
    if (typeof names?.canonical === 'string' && names.canonical !== '') return names.canonical;
    return session.target === null ? `New ${session.kind}` : session.target.id;
  };
  const changedSince = (session: EditorSession): boolean => {
    if (session.target === null) return false;
    const table = store.getState().records[session.target.kind] as Readonly<Record<string, AnyRecord>>;
    const current = Object.hasOwn(table, session.target.id) ? table[session.target.id] : undefined;
    return current === undefined || session.baseRecord === null || !sameValue(session.baseRecord, current);
  };
  const buildView = (): DraftsView => {
    const kept = [...slots.values()].filter((slot) => slot.edited).sort((a, b) => (a.session.updatedAt < b.session.updatedAt ? -1 : a.session.updatedAt > b.session.updatedAt ? 1 : 0));
    const items: (DraftListItem | UnreadableDraft)[] = kept.map((slot) => ({
      id: slot.session.id,
      unreadable: false,
      kind: slot.session.kind,
      name: nameOfSession(slot.session),
      isNew: slot.session.target === null,
      updatedAt: slot.session.updatedAt,
      changedSince: changedSince(slot.session),
    }));
    for (const [id, reason] of [...unreadable].sort(([a], [b]) => (a < b ? -1 : 1))) items.push({ id, unreadable: true, reason });
    return { items, count: loaded ? items.length : null, keeping: keepingNow() };
  };
  const notify = (): void => {
    if (disposed) return;
    cached = undefined;
    for (const listener of [...listeners]) listener();
  };

  const setSave = (slot: Slot, save: DraftSaveState): void => {
    slot.save = save;
    slot.entry = makeEntry(slot);
    notify();
  };
  const setSession = (slot: Slot, session: EditorSession): void => {
    slot.session = session;
    slot.entry = makeEntry(slot);
  };

  // ---- saving: a throttle (the timer is started by the first edit and never restarted by later ones)
  const saveSlot = (slot: Slot): Promise<void> => {
    if (slot.removed) return Promise.resolve();
    if (slot.saving !== undefined) return slot.saving; // the finishing save schedules the next one if the session moved on
    if (adapter === undefined) {
      setSave(slot, { state: 'memory' });
      return Promise.resolve();
    }
    if (status.get().mode !== 'writer') {
      setSave(slot, { state: 'failed', reason: 'this tab is not the one saving' });
      return Promise.resolve();
    }
    const sent = slot.session;
    if (byteLength(JSON.stringify(sent)) > MAX_DRAFT_ROW_BYTES) {
      setSave(slot, { state: 'failed', reason: 'the draft is over 1 MB, so it is not kept; it stays open in this window' });
      return Promise.resolve();
    }
    setSave(slot, { state: 'saving' });
    const run = (async (): Promise<void> => {
      try {
        await adapter.saveEditorSession(sent);
        if (slot.removed) return;
        if (slot.session === sent) setSave(slot, { state: 'saved', at: ids.now() });
        else schedule(slot); // edited while the row was being written
      } catch (error) {
        const reason = describe(error);
        log.add({ source: 'app', event: { type: 'draft_save_failed', message: `a draft could not be saved (${reason})` } });
        if (!slot.removed) setSave(slot, { state: 'failed', reason });
      } finally {
        slot.saving = undefined;
      }
    })();
    slot.saving = run;
    return run;
  };
  function schedule(slot: Slot): void {
    if (slot.cancelTimer !== undefined || slot.removed) return;
    if (slot.save.state !== 'saving') setSave(slot, { state: 'saving' });
    slot.cancelTimer = timers.after(DRAFT_SAVE_INTERVAL_MS, () => {
      slot.cancelTimer = undefined;
      void saveSlot(slot);
    });
  }
  const stopTimer = (slot: Slot): void => {
    slot.cancelTimer?.();
    slot.cancelTimer = undefined;
  };

  const addSlot = (session: EditorSession, edited: boolean, save: DraftSaveState): Slot => {
    const slot: Slot = { session, edited, save, cancelTimer: undefined, saving: undefined, removed: false, entry: undefined as unknown as DraftEntry };
    slot.entry = makeEntry(slot);
    slots.set(session.id, slot);
    return slot;
  };
  const dropSlot = (slot: Slot): void => {
    slot.removed = true;
    stopTimer(slot);
    slots.delete(slot.session.id);
  };
  const removeRow = async (id: string): Promise<void> => {
    if (adapter === undefined) return;
    try {
      await adapter.deleteEditorSession(id);
    } catch (error) {
      log.add({ source: 'app', event: { type: 'draft_delete_failed', message: `a draft row could not be deleted (${describe(error)})` } });
    }
  };

  const unavailable = (): OpenDraftResult | undefined => {
    const mode = status.get().mode;
    if (mode === null) return { ok: false, reason: 'starting', message: 'The app is still starting.' };
    if (!writable()) return { ok: false, reason: 'read_only', message: 'This tab is read-only: edit in the tab that is saving' };
    return undefined;
  };
  const storedCount = (): number => [...slots.values()].filter((slot) => slot.edited).length + unreadable.size;

  const unsubscribeStore = store.subscribe(() => notify());

  return {
    view: () => (cached ??= buildView()),
    entry: (id) => slots.get(id)?.entry,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    open(target) {
      const refused = unavailable();
      if (refused !== undefined) return refused;
      if ('id' in target) {
        const key = targetKey(target);
        for (const slot of slots.values()) if (slot.session.target !== null && targetKey(slot.session.target) === key) return { ok: true, id: slot.session.id };
      }
      if (storedCount() >= MAX_STORED_DRAFTS) {
        return { ok: false, reason: 'too_many', message: `There are ${MAX_STORED_DRAFTS} unfinished drafts, the most that are kept. Finish or discard one first.` };
      }
      const opened = openSession(ids, store.getState(), store.getRevision(), target);
      if (!opened.ok) return { ok: false, reason: 'not_found', message: 'That record no longer exists.' };
      addSlot(opened.session, false, adapter === undefined ? { state: 'memory' } : { state: 'idle' });
      notify();
      return { ok: true, id: opened.session.id };
    },
    openStored(id) {
      const refused = unavailable();
      if (refused !== undefined) return refused;
      return slots.has(id) ? { ok: true, id } : { ok: false, reason: 'not_found', message: 'That draft no longer exists.' };
    },
    edit(id, recipe, meta) {
      const slot = slots.get(id);
      if (slot === undefined || !writable()) return;
      const next = editDraft(slot.session, recipe, ids, meta);
      if (next === slot.session) return;
      setSession(slot, next);
      slot.edited = true;
      if (adapter === undefined) setSave(slot, { state: 'memory' });
      else schedule(slot);
      notify();
    },
    undo(id) {
      const slot = slots.get(id);
      if (slot === undefined || !writable() || !canUndoDraft(slot.session)) return;
      setSession(slot, undoDraft(slot.session, ids));
      slot.edited = true;
      if (adapter === undefined) setSave(slot, { state: 'memory' });
      else schedule(slot);
      notify();
    },
    redo(id) {
      const slot = slots.get(id);
      if (slot === undefined || !writable() || !canRedoDraft(slot.session)) return;
      setSession(slot, redoDraft(slot.session, ids));
      slot.edited = true;
      if (adapter === undefined) setSave(slot, { state: 'memory' });
      else schedule(slot);
      notify();
    },
    release(id) {
      const slot = slots.get(id);
      if (slot === undefined || slot.edited) return;
      dropSlot(slot);
      notify();
    },
    async commit(id, choices, section) {
      const slot = slots.get(id);
      if (slot === undefined) return { ok: false, reason: 'gone' };
      const outcome = commitDraft(store, slot.session, ids, choices, section === undefined ? {} : { section });
      if (!outcome.ok) return outcome;
      const hadRow = slot.edited && adapter !== undefined;
      dropSlot(slot);
      notify();
      if (hadRow) await removeRow(id);
      return outcome;
    },
    async discard(id) {
      const slot = slots.get(id);
      if (slot === undefined) return;
      dropSlot(slot);
      notify();
      await removeRow(id);
    },
    async discardUnreadable(id) {
      if (!unreadable.delete(id)) return;
      notify();
      await removeRow(id);
    },
    async flush() {
      const dirty = [...slots.values()].filter((slot) => slot.edited && (slot.cancelTimer !== undefined || slot.save.state === 'saving'));
      for (const slot of dirty) stopTimer(slot);
      await Promise.all(dirty.map((slot) => saveSlot(slot)));
    },
    async refresh() {
      if (adapter === undefined || disposed) return;
      if (status.get().mode !== 'writer') return; // another tab owns the stored drafts until this one is the writer
      let rows: readonly unknown[];
      try {
        rows = await adapter.listEditorSessions();
      } catch (error) {
        log.add({ source: 'app', event: { type: 'drafts_unreadable', message: `the stored drafts could not be read (${describe(error)})` } });
        loaded = true;
        notify();
        return;
      }
      if (disposed) return;
      for (const row of rows) {
        const parsed = parseStoredSession(row);
        if (parsed.ok) {
          if (!slots.has(parsed.session.id)) addSlot(parsed.session, true, { state: 'saved', at: parsed.session.updatedAt });
        } else {
          const id = (row as { id?: unknown } | null)?.id;
          if (typeof id === 'string') unreadable.set(id, parsed.reason);
        }
      }
      loaded = true;
      notify();
    },
    dispose() {
      disposed = true;
      unsubscribeStore();
      for (const slot of slots.values()) stopTimer(slot);
      listeners.clear();
    },
  };
}
