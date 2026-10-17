/**
 * Editor sessions (ADR-040, docs/ARCHITECTURE.md §23, docs/UI_ARCHITECTURE.md §7). `EditorSession` and `DraftCommitOutcome` stay in
 * `core/commands/contracts.ts`; this file holds what the editing module adds around them. Pure data: the UI renders it.
 */
import type { EditorSession } from '../commands/contracts';
import type { RecordKind, RecordRef } from '../schema';

/** At most this many steps stay on a session's local `past` (and so on `future`); the oldest are dropped first. */
export const MAX_DRAFT_STEPS = 200;
/** An edit to the SAME field path within this many milliseconds of the previous edit joins the previous undo step. */
export const COALESCE_WINDOW_MS = 1000;

/** What an edit tells the session about itself. */
export interface EditMeta {
  /** The field path the edit changed, e.g. "names.canonical"; the key for coalescing. Absent: the edit never coalesces. */
  readonly path?: string;
}

export type OpenTarget = RecordRef | { readonly kind: RecordKind };

export type OpenSessionResult =
  | { readonly ok: true; readonly session: EditorSession }
  | { readonly ok: false; readonly reason: 'not_found' };

/** Who changed a field since the session started (by canonical text, never by revision). */
export type FieldStatus = 'same' | 'theirsOnly' | 'mineOnly' | 'both';

export interface FieldComparison {
  /** "tags" for a top-level field, "names.canonical" one level into a plain object. */
  readonly path: string;
  readonly segments: readonly string[];
  /** The value when the session started; undefined = the field was absent. Same for the next two. */
  readonly base: unknown;
  readonly theirs: unknown;
  readonly mine: unknown;
  readonly status: FieldStatus;
}

/** How a `both` field is resolved: keep the draft's value or take the stored one. */
export type ConflictChoice = 'mine' | 'theirs';
export type ConflictChoices = Readonly<Record<string, ConflictChoice>>;

export interface CommitOptions {
  /** The section edited, for the history label "Edit <section> of <name>". Default "record". */
  readonly section?: string;
}
