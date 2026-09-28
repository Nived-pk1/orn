/**
 * The message the writer posts after each persisted transaction (docs/PERSISTENCE.md §10, ADR-033), and the
 * validation of what a follower receives: another tab (possibly another app version) is not trusted, so a message
 * is checked and bounded before anything is read from storage because of it.
 */
import type { ChangeMessage } from './contracts';

/** Above this many changed records the message says `'all'` and followers reload fully (bounded message, bounded read). */
export const MAX_CHANGED_IDS = 2_000;
const MAX_ID_CHARS = 512;

const isRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** `undefined` for anything that is not a well-formed message; the follower ignores it and says so. */
export function parseChangeMessage(value: unknown): ChangeMessage | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { fromRevision, revision, changedIds } = value as Record<string, unknown>;
  if (!isRevision(fromRevision) || !isRevision(revision)) return undefined;
  if (changedIds === 'all') return revision >= fromRevision ? { fromRevision, revision, changedIds } : undefined;
  if (revision <= fromRevision || !Array.isArray(changedIds) || changedIds.length > MAX_CHANGED_IDS) return undefined;
  if (!changedIds.every((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_CHARS)) return undefined;
  return { fromRevision, revision, changedIds: [...new Set(changedIds)] };
}

/** The message for one transaction from `fromRevision` to `revision` that touched `ids`. */
export function changeMessageFor(fromRevision: number, revision: number, ids: Iterable<string>): ChangeMessage {
  const changedIds = [...new Set(ids)];
  return { fromRevision, revision, changedIds: changedIds.length > MAX_CHANGED_IDS ? 'all' : changedIds };
}
