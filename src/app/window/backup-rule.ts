/**
 * How old the last backup is and when to say so (step 8.4s, S4; audit DA-04). Pure: the revision, the stored marks and the injected clock
 * go in, words and a yes/no come out. A "backup" is an Everything export that finished; the marks live in `uiState`.
 */
export const BACKUP_CHANGES = 200;
export const BACKUP_DAYS = 3;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A moment in the dataset's life: the store revision and the (injected-clock) time, ISO. */
export interface BackupMark {
  readonly revision: number;
  readonly at: string;
}

/** A stored mark, read tolerantly: anything that is not a good mark is no mark. */
export function parseMark(value: unknown): BackupMark | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { revision, at } = value as { revision?: unknown; at?: unknown };
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return undefined;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return undefined;
  return { revision, at };
}

const plural = (count: number, one: string): string => `${count} ${one}${count === 1 ? '' : 's'}`;

export function agoWords(ms: number): string {
  if (ms < MINUTE) return 'just now';
  if (ms < HOUR) return `${plural(Math.floor(ms / MINUTE), 'minute')} ago`;
  if (ms < DAY) return `${plural(Math.floor(ms / HOUR), 'hour')} ago`;
  return `${plural(Math.floor(ms / DAY), 'day')} ago`;
}

const sinceOf = (last: BackupMark | undefined, revision: number): number => Math.max(0, revision - (last?.revision ?? 0));

/** The Studio status line's words: "Backed up 2 days ago, 340 changes since" or "No backup yet". */
export function backupLineOf(last: BackupMark | undefined, revision: number, nowMs: number): string {
  if (last === undefined) return 'No backup yet';
  const since = sinceOf(last, revision);
  return `Backed up ${agoWords(nowMs - Date.parse(last.at))}, ${since === 0 ? 'no changes' : plural(since, 'change')} since`;
}

export const backupNoticeText = (changes: number): string => `${changes} ${changes === 1 ? 'change is' : 'changes are'} not in a backup.`;

/**
 * The notice shows when the changes since the last backup reach 200, or 3 days have passed with at least one change. With no backup yet
 * there is no time to count from, so only the 200. Dismiss hides it until 200 more changes or 3 more days since the dismissal.
 */
export function backupNoticeDue(input: { readonly last: BackupMark | undefined; readonly revision: number; readonly nowMs: number; readonly dismissed?: BackupMark | undefined }): boolean {
  const { last, revision, nowMs, dismissed } = input;
  const since = sinceOf(last, revision);
  if (since === 0) return false;
  const due = since >= BACKUP_CHANGES || (last !== undefined && nowMs - Date.parse(last.at) >= BACKUP_DAYS * DAY);
  if (!due) return false;
  // a dismissal made before the last backup was answered by that backup
  if (dismissed === undefined || (last !== undefined && dismissed.revision < last.revision)) return true;
  return revision - dismissed.revision >= BACKUP_CHANGES || nowMs - Date.parse(dismissed.at) >= BACKUP_DAYS * DAY;
}
