/**
 * The main-side L4 service (Phase 4 contract decisions Q2, Q10; step 4.3b). It reads the canonical state and the store's ChangeSets
 * through PORTS, decides what to re-check, sends batches to the stateless chem worker, and merges the answers into the finding
 * store by rule. It never changes data, never blocks a commit, and holds no chemistry (that is `src/chem/checks`).
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { FindingStore } from '@/core/validation/contracts';
import type { NotCompared } from '@/chem/checks/contracts';
import type { ChemService } from '../client';

/** What the service needs from the app. Nothing else is reachable: no store handle, no persistence, no clock. */
export interface L4Ports {
  /** The current canonical state (read only). */
  readonly state: () => CanonicalState;
  readonly findings: Pick<FindingStore, 'replaceForRules'>;
  /** The chem worker's checks as values (`timeout` and `unavailable` are answers, never exceptions). */
  readonly chem: Pick<ChemService, 'checkSpecies' | 'checkReaction' | 'checkMechanism' | 'matches'>;
  /**
   * The debounce: called when work is waiting, with the function that does it. The app runs it after a quiet period; a test runs
   * it at once or never (and calls `flush`). Called at most once until the work has run.
   */
  readonly schedule: (run: () => void) => void;
}

/**
 * The state of one subject's L4 checks, for the UI (Phase 5): `pending` (queued or in flight), `checked` (with what could not be
 * compared, said out loud), `not_checked` (the toolkit did not answer for it; `remembered`: it will not be sent again until its
 * structure changes), `none` (not a subject of L4, or not queued yet).
 */
export type SubjectStatus =
  | { readonly state: 'none' }
  | { readonly state: 'pending' }
  | { readonly state: 'checked'; readonly notCompared: readonly NotCompared[] }
  | { readonly state: 'not_checked'; readonly reason: 'unavailable' | 'timeout'; readonly message: string; readonly remembered: boolean };

/** Counters for tests and the bench: how much work the service asked of the worker. Never used for decisions. */
export interface L4Stats {
  /** Calls to the worker, per method. */
  readonly calls: Readonly<Record<'checkSpecies' | 'checkReaction' | 'checkMechanism' | 'matches', number>>;
  /** Items sent in those calls, per method (species, outcomes, steps, probes). */
  readonly items: Readonly<Record<'checkSpecies' | 'checkReaction' | 'checkMechanism' | 'matches', number>>;
  /** Results dropped because the record changed again while the check was running. */
  readonly staleDropped: number;
  /** Subjects not sent because their structure is remembered as not checkable. */
  readonly rememberedSkipped: number;
}

export interface L4Service {
  /** Feed every ChangeSet the store announces. Decides what to re-check and schedules it; returns at once. */
  onChange(changes: ChangeSet): void;
  /** Queue every species, reaction and mechanism (boot, reload, "check again"). Not-checkable structures stay remembered. */
  checkAll(): void;
  /** Runs what is queued now (the debounce's target) and resolves when it and anything queued meanwhile is done. */
  flush(): Promise<void>;
  statusOf(ref: RecordRef): SubjectStatus;
  /** Called when any status changed. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  stats(): L4Stats;
  /** Stops for good: results still in flight are dropped, nothing more is sent. */
  dispose(): void;
}

/** Species per `checkSpecies` call, outcomes per `checkReaction`, steps per `checkMechanism`, probes per `matches`. */
export const L4_BATCH_SIZE = 32;
/** Structures the not-checkable memory keeps (oldest forgotten first); a forgotten structure is simply sent again. */
export const NOT_CHECKABLE_CAP = 2_000;
