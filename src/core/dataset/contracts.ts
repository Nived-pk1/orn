/**
 * Change sets: the unit that flows from the store to indexes, validation, search, persistence and
 * worker replicas — docs/ARCHITECTURE.md §2.4 and docs/PERSISTENCE.md §3.
 */
import type { Patch } from 'immer';
import type { RecordRef } from '../schema';

export interface ChangeSet {
  /** Store revision after this change. Revisions increase by exactly 1 per commit. */
  readonly revision: number;
  readonly label: string;
  readonly cause: 'command' | 'undo' | 'redo' | 'replace';
  readonly created: readonly RecordRef[];
  readonly updated: readonly RecordRef[];
  readonly deleted: readonly RecordRef[];
  /** Immer patches over CanonicalState (paths start with 'records' or 'meta'). */
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}
