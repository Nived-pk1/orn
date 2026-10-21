/**
 * The draft manager as a lazy chunk (entry room, exams step part A). The real manager (`drafts.ts`) and the editing core it uses are
 * loaded by the scheduler after the first paint (`start()`), or at once by whoever calls `refresh()`. Until then it answers what a
 * manager that has no drafts yet would: nothing is open, the count is not known, and opening says editing is starting. Once loaded it
 * forwards every call. Studio only (Study has the inert stand-in, ADR-041). No chemistry.
 */
import type { DraftManager, DraftsView, OpenDraftResult } from './drafts-types';
import type { DraftManagerOptions } from './drafts';

export interface LazyDraftManager extends DraftManager {
  /** Schedules the load (once) with the injected scheduler; the stored rows are read when it has loaded. */
  start(): void;
}

const PENDING: DraftsView = { items: [], count: null, keeping: 'stored' };
const STARTING: OpenDraftResult = { ok: false, reason: 'starting', message: 'Editing is still loading. Try again in a moment.' };

export function createLazyDraftManager(options: DraftManagerOptions): LazyDraftManager {
  const listeners = new Set<() => void>();
  let inner: DraftManager | undefined;
  let loading: Promise<DraftManager | undefined> | undefined;
  let scheduled = false;
  let disposed = false;
  let stopInner: (() => void) | undefined;
  let cancelStart: (() => void) | undefined;

  const load = (): Promise<DraftManager | undefined> =>
    (loading ??= import('./drafts').then((m) => {
      if (disposed) return undefined;
      inner = m.createDraftManager(options);
      stopInner = inner.subscribe(() => {
        for (const listener of [...listeners]) listener();
      });
      for (const listener of [...listeners]) listener();
      return inner;
    }));

  return {
    start() {
      if (scheduled || disposed) return;
      scheduled = true;
      cancelStart = options.timers.after(0, () => void load().then((manager) => manager?.refresh()));
    },
    view: () => inner?.view() ?? PENDING,
    entry: (id) => inner?.entry(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    open: (target) => inner?.open(target) ?? STARTING,
    openStored: (id) => inner?.openStored(id) ?? STARTING,
    edit: (id, recipe, meta) => inner?.edit(id, recipe, meta),
    undo: (id) => inner?.undo(id),
    redo: (id) => inner?.redo(id),
    release: (id) => inner?.release(id),
    commit: async (id, choices, section) => (inner === undefined ? { ok: false, reason: 'gone' } : inner.commit(id, choices, section)),
    discard: async (id) => inner?.discard(id),
    discardUnreadable: async (id) => inner?.discardUnreadable(id),
    flush: async () => inner?.flush(),
    newId: (prefix) => options.ids.newId(prefix),
    refresh: async () => (await load())?.refresh(),
    dispose() {
      disposed = true;
      cancelStart?.();
      stopInner?.();
      inner?.dispose();
      inner = undefined;
      listeners.clear();
    },
  };
}
