/**
 * What the window remembers about backups (step 8.4s, S4): the last finished Everything export and the last time the "not in a backup"
 * notice was dismissed. Two tolerant `uiState` keys (a damaged value is no value); no schema, import-format or persistence version change.
 * Like `own-data.ts`: a tab that cannot write keeps the marks in memory only. Not canonical: it only decides what the window says.
 */
import type { AppServices } from '@/app/services';
import { parseMark, type BackupMark } from './backup-rule';

export const LAST_BACKUP_KEY = 'lastBackup';
export const DISMISSED_KEY = 'lastBackupNoticeDismissed';

export interface BackupMarks {
  readonly last: BackupMark | undefined;
  readonly dismissed: BackupMark | undefined;
}

export interface BackupRecord {
  get(): BackupMarks;
  /** An Everything export finished; `revision` is the revision it exported. */
  markBackedUp(revision: number): void;
  /** The notice was dismissed at this revision. */
  dismiss(revision: number): void;
  subscribe(listener: () => void): () => void;
}

export function createBackupRecord(services: Partial<Pick<AppServices, 'bootReport' | 'persistence' | 'status'>>, nowMs: () => number): BackupRecord {
  let marks: BackupMarks = { last: parseMark(services.bootReport?.uiState[LAST_BACKUP_KEY]), dismissed: parseMark(services.bootReport?.uiState[DISMISSED_KEY]) };
  const listeners = new Set<() => void>();
  const write = (key: string, mark: BackupMark): void => {
    if (services.persistence === undefined || services.status?.get().mode !== 'writer') return;
    // a write that fails is not an error of the export: the line simply starts again at the next visit
    void services.persistence.setUiState(key, { revision: mark.revision, at: mark.at }).catch(() => undefined);
  };
  const stamp = (revision: number): BackupMark => ({ revision, at: new Date(nowMs()).toISOString() });
  const change = (next: BackupMarks): void => {
    marks = next;
    for (const listener of listeners) listener();
  };
  return {
    get: () => marks,
    markBackedUp(revision) {
      const mark = stamp(revision);
      change({ last: mark, dismissed: undefined });
      write(LAST_BACKUP_KEY, mark);
    },
    dismiss(revision) {
      const mark = stamp(revision);
      change({ ...marks, dismissed: mark });
      write(DISMISSED_KEY, mark);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/** No marks, nothing written (a window without the services, a test, Study). */
const NONE: BackupMarks = { last: undefined, dismissed: undefined };
export const NO_BACKUP_RECORD: BackupRecord = { get: () => NONE, markBackedUp: () => undefined, dismiss: () => undefined, subscribe: () => () => undefined };
