/**
 * Change sets: the unit that flows from the store to indexes, validation, search, persistence and
 * worker replicas — docs/ARCHITECTURE.md §2.4 and docs/PERSISTENCE.md §3.
 */
import type { Patch } from 'immer';
import type { RecordRef } from '../schema';

export interface ChangeSet {
  /**
   * Store revision after this change. Revisions increase by exactly 1 per commit, except for `'remote'`, which a
   * follower tab applies for the writer's whole persisted transaction and which may therefore span several revisions.
   */
  readonly revision: number;
  readonly label: string;
  /**
   * `'remote'`: a follower tab mirroring what the writer already persisted (ADR-033). The write queue never persists
   * it (the follower is not the writer, INV-28), and indexes accept it as a forward span.
   */
  readonly cause: 'command' | 'undo' | 'redo' | 'replace' | 'remote';
  readonly created: readonly RecordRef[];
  readonly updated: readonly RecordRef[];
  readonly deleted: readonly RecordRef[];
  /** Immer patches over CanonicalState (paths start with 'records' or 'meta'). */
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

/** Injected time source: milliseconds since the Unix epoch. The core never reads the system clock. */
export interface Clock {
  nowMs(): number;
}

/** Injected randomness: uniform floats in [0, 1). The core never calls Math.random. */
export interface RandomSource {
  next(): number;
}

/** ID and timestamp capability handed to commands (structurally a CommandContext). */
export interface IdFactory {
  /** UTC ISO timestamp with milliseconds. */
  now(): string;
  /** New `<prefix>_<lowercase ULID>`; IDs from one factory are strictly increasing. */
  newId(prefix: string): string;
}
