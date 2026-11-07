/**
 * The phone's one-line alert (ADR-039): the status line is hidden on a phone EXCEPT a single line when something needs the user. A pure
 * function of `AppStatus`, in a fixed order of importance: the first that applies is the line; the rest is under Status (nothing silent).
 */
import type { AppStatus } from '@/app/services';
import type { StudyChrome } from '@/ui/study-chrome';
import { quarantineTextOf, storageTextOf } from './banners';

/** What a student reads (step 8.3b, 0.3): the same words as the storage notice, short; a tap opens the backup action. */
export const STUDY_STORAGE_ALERT = 'Your data may be cleared. Back it up.';

/** `chrome`: the student edition tells the storage line only after the visitor imported own data (step 8.3, C1); real problems always. */
export function alertOf(status: AppStatus, chrome?: StudyChrome): string | null {
  if (status.save?.state === 'failed') return 'Saving failed: your changes are not saved';
  if (status.replica.state === 'down' || (['chem', 'layout', 'search'] as const).some((name) => status.workers[name].state === 'down')) return 'A background worker stopped';
  if ((['chem', 'layout'] as const).some((name) => status.engines[name].state === 'unavailable')) return 'A checking engine could not start';
  const setAside = quarantineTextOf(status);
  if (setAside !== null) return setAside;
  if (status.mode === 'session_only') return 'Nothing is saved in this session';
  const storage = chrome?.storageWarning === 'none' ? null : storageTextOf(status);
  if (storage !== null) return chrome?.storageWarning === 'visitor' ? STUDY_STORAGE_ALERT : storage;
  return null;
}
