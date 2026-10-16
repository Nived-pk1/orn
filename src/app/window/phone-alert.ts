/**
 * The phone's one-line alert (ADR-039): the status line is hidden on a phone EXCEPT a single line when something needs the user. A pure
 * function of `AppStatus`, in a fixed order of importance: the first that applies is the line; the rest is under Status (nothing silent).
 */
import type { AppStatus } from '@/app/services';
import { quarantineTextOf, storageTextOf } from './banners';

export function alertOf(status: AppStatus): string | null {
  if (status.save?.state === 'failed') return 'Saving failed: your changes are not saved';
  if (status.replica.state === 'down' || (['chem', 'layout', 'search'] as const).some((name) => status.workers[name].state === 'down')) return 'A background worker stopped';
  if ((['chem', 'layout'] as const).some((name) => status.engines[name].state === 'unavailable')) return 'A checking engine could not start';
  const setAside = quarantineTextOf(status);
  if (setAside !== null) return setAside;
  if (status.mode === 'session_only') return 'Nothing is saved in this session';
  const storage = storageTextOf(status);
  if (storage !== null) return storage;
  return null;
}
