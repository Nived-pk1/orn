/**
 * What the duplicate check on Save needs of the app (step 6.2a part 5): the records a species draft may repeat, and a way to show one of
 * them. The app fills it; the dialog decides nothing. `reasons`: `name` (the same folded name and qualifier), `structure` (the same canonical
 * structure).
 */
import type { RecordKind, RecordRef, StructureRep } from '@/core/schema';

export interface DuplicateMatch {
  readonly ref: RecordRef;
  readonly name: string;
  readonly qualifier?: string;
  readonly formula?: string;
  readonly structure?: StructureRep;
  readonly reasons: readonly ('name' | 'structure')[];
}

export interface DuplicateOutcome {
  readonly matches: readonly DuplicateMatch[];
  /** Matches beyond the ones listed. */
  readonly more: number;
  /** False when the chemistry engine could not say whether the structure repeats one (`message` says why, in words). */
  readonly structureChecked: boolean;
  readonly message?: string;
}

export interface DuplicatePort {
  check(kind: RecordKind, draft: unknown): Promise<DuplicateOutcome>;
  /** Shows a record in the inspector. */
  openRecord(ref: RecordRef): void;
}

/** What the app service answers: the check alone (showing a record is the window's). */
export type DuplicateCheckPort = Pick<DuplicatePort, 'check'>;
