/**
 * What the reader keeps for revision (step 8.4g Part B, G2 and G3): the starred records (at most 500) and the last 20 records opened. Two
 * OPTIONAL `uiState` keys (`starred`, `recent`), read tolerantly at boot: PERSISTENCE.md "Stored in uiState with tolerant schemas ... last
 * view, recent searches" lists this kind of entry, so no schema, import-format or persistence version change. Like `backup-record.ts`, a tab
 * that cannot write keeps the marks in memory only. Not canonical, never derived chemistry: it only decides what the window lists.
 */
import type { RecordRef } from '@/core/schema';
import type { AppServices } from '@/app/services';
import { parseRefs, RECENT_LIMIT, STAR_LIMIT, toggleStar, touchRecent, type StarResult } from './my-records-rule';

export const STARRED_KEY = 'starred';
export const RECENT_KEY = 'recent';

export interface MyRecords {
  /** The same array until a star changes (it is a store snapshot). */
  starred(): readonly RecordRef[];
  isStarred(ref: RecordRef): boolean;
  toggle(ref: RecordRef): StarResult['result'];
  recent(): readonly RecordRef[];
  touch(ref: RecordRef): void;
  clearRecent(): void;
  subscribe(listener: () => void): () => void;
}

export function createMyRecords(services: Partial<Pick<AppServices, 'bootReport' | 'persistence' | 'status'>> = {}): MyRecords {
  let starred: readonly RecordRef[] = parseRefs(services.bootReport?.uiState[STARRED_KEY], STAR_LIMIT);
  let recent: readonly RecordRef[] = parseRefs(services.bootReport?.uiState[RECENT_KEY], RECENT_LIMIT);
  const listeners = new Set<() => void>();
  const tell = (): void => {
    for (const listener of listeners) listener();
  };
  const write = (key: string, list: readonly RecordRef[]): void => {
    if (services.persistence === undefined || services.status?.get().mode !== 'writer') return;
    // a write that fails is not an error of the click: the mark is simply not there at the next visit
    void services.persistence.setUiState(key, list.map((ref) => ({ kind: ref.kind, id: ref.id }))).catch(() => undefined);
  };
  const same = (x: RecordRef | undefined, y: RecordRef): boolean => x !== undefined && x.kind === y.kind && x.id === y.id;
  return {
    starred: () => starred,
    isStarred: (ref) => starred.some((one) => same(one, ref)),
    toggle(ref) {
      const done = toggleStar(starred, ref);
      if (done.result === 'full') return 'full';
      starred = done.list;
      write(STARRED_KEY, starred);
      tell();
      return done.result;
    },
    recent: () => recent,
    touch(ref) {
      if (same(recent[0], ref)) return;
      recent = touchRecent(recent, ref);
      write(RECENT_KEY, recent);
      tell();
    },
    clearRecent() {
      if (recent.length === 0) return;
      recent = [];
      write(RECENT_KEY, recent);
      tell();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
