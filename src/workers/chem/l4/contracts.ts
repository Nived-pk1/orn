/**
 * The main-side L4 service (Phase 4 contract decisions Q2, Q10; step 4.3b). It reads the canonical state and the store's ChangeSets
 * through PORTS, decides what to re-check, sends batches to the stateless chem worker, and merges the answers into the finding
 * store by rule. It never changes data, never blocks a commit, and holds no chemistry (that is `src/chem/checks`).
 */
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { CoreIndexes } from '@/core/indexes/contracts';
import type { FindingStore } from '@/core/validation/contracts';
import type { NotCompared } from '@/chem/checks/contracts';
import type { ChemService } from '../client';

/** What the service needs from the app. Nothing else is reachable: no store handle, no persistence, no clock. */
export interface L4Ports {
  /** The current canonical state (read only). */
  readonly state: () => CanonicalState;
  readonly findings: Pick<FindingStore, 'replaceForRules'>;
  /**
   * The store's indexes as of the change being announced (the store applies them before it notifies): which reactions refer to a
   * species, which species list a class (`referrersOf`) and the class's descendants (`descendantsOf`). Read only, never kept past the call.
   */
  readonly indexes: () => Pick<CoreIndexes, 'referrersOf' | 'descendantsOf'>;
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
  /** Records queued only because something they refer to changed (reactions of a species, species of a class), ever. */
  readonly referrerQueued: number;
  /** The most of them one change put in the queue at once (at most `RECHECK_CAP`); the rest waited behind them. */
  readonly maxQueuedAtOnce: number;
  /** Referrers waiting behind the cap right now (they show as `pending`). */
  readonly backlog: number;
}

/**
 * How the L4 checks stand, for the status line (step 5.1b): `queued` records are waiting or being checked, `notChecked` records
 * have a `not_checked` status (the toolkit did not answer for them; they are said out loud, never counted as clean).
 */
export interface L4Summary {
  readonly queued: number;
  readonly notChecked: number;
}

export interface L4Service {
  /** Feed every ChangeSet the store announces. Decides what to re-check and schedules it; returns at once. */
  onChange(changes: ChangeSet): void;
  /** Queue every species, reaction and mechanism (boot, reload, "check again"). Not-checkable structures stay remembered. */
  checkAll(): void;
  /** Runs what is queued now (the debounce's target) and resolves when it and anything queued meanwhile is done. */
  flush(): Promise<void>;
  statusOf(ref: RecordRef): SubjectStatus;
  /** Cheap (counters, no scan): what the status line shows. */
  summary(): L4Summary;
  /**
   * The formula the toolkit derived from the species' structure (step 5.1b, Q9), or undefined when none is known: not read yet, the
   * structure changed since, or the toolkit did not answer. Derived data, held in memory only (INV-11).
   */
  derivedFormulaOf(ref: RecordRef): string | undefined;
  /**
   * The ids of the species whose canonical structure (RDKit's canonical SMILES, atom maps kept) is `canonical`, as the checks know them now (step 6.2a,
   * additive: the duplicate check on Save). Derived data in memory (INV-11); a species not checked yet is not listed. Sorted.
   */
  speciesWithCanonical(canonical: string): readonly string[];
  /** Called with the ids of the species whose derived formula was learned, changed or dropped. Returns the unsubscribe function. */
  subscribeFormulas(listener: (ids: readonly string[]) => void): () => void;
  /** Called when any status changed or work was queued. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  stats(): L4Stats;
  /** Stops for good: results still in flight are dropped, nothing more is sent. */
  dispose(): void;
}

/** Species per `checkSpecies` call, outcomes per `checkReaction`, steps per `checkMechanism`, probes per `matches`. */
export const L4_BATCH_SIZE = 32;
/** Structures the not-checkable memory keeps (oldest forgotten first); a forgotten structure is simply sent again. */
export const NOT_CHECKABLE_CAP = 2_000;
