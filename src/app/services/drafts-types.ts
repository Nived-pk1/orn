/**
 * The session manager's public types and bounds (step 6.1a part 3, ADR-040). Plain data: the UI and the tests read them.
 */
import type { ConflictChoices, DraftRecipe, EditMeta, OpenTarget } from '@/core/editing';
import type { DraftCommitOutcome, EditorSession } from '@/core/commands';
import type { RecordKind } from '@/core/schema';

export const MAX_STORED_DRAFTS = 20;
export const MAX_DRAFT_ROW_BYTES = 1_048_576;
export const DRAFT_SAVE_INTERVAL_MS = 2000;

/** What the editor says about the draft's storage. `idle`: opened, nothing changed yet. */
export type DraftSaveState =
  | { readonly state: 'idle' }
  | { readonly state: 'saving' }
  | { readonly state: 'saved'; readonly at: string }
  | { readonly state: 'failed'; readonly reason: string }
  /** Session-only tab: the draft lives in this window only. */
  | { readonly state: 'memory' };

/** One open or stored session as the UI sees it; replaced (never mutated) when anything about it changes. */
export interface DraftEntry {
  readonly id: string;
  readonly session: EditorSession;
  readonly save: DraftSaveState;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface DraftListItem {
  readonly id: string;
  readonly unreadable: false;
  readonly kind: RecordKind;
  /** The record's name (or its ID, or "New <kind>"). */
  readonly name: string;
  readonly isNew: boolean;
  readonly updatedAt: string;
  /** The record changed (or was deleted) since the draft was started. */
  readonly changedSince: boolean;
}

export interface UnreadableDraft {
  readonly id: string;
  readonly unreadable: true;
  readonly reason: string;
}

export interface DraftsView {
  /** Readable drafts, oldest edit first, then the unreadable rows. */
  readonly items: readonly (DraftListItem | UnreadableDraft)[];
  /** Drafts plus unreadable rows: the number the start-up line and the File menu say. null until the stored rows were read. */
  readonly count: number | null;
  /** What the editor says about keeping drafts. */
  readonly keeping: 'stored' | 'memory' | 'read_only';
}

export type OpenDraftResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: 'read_only' | 'starting' | 'too_many' | 'not_found'; readonly message: string };

export interface DraftManager {
  /** The cached view: the same object until something changes (for `useSyncExternalStore`). */
  view(): DraftsView;
  entry(id: string): DraftEntry | undefined;
  subscribe(listener: () => void): () => void;
  open(target: OpenTarget): OpenDraftResult;
  /** Reopens a listed draft (its stored session, with its local undo history). */
  openStored(id: string): OpenDraftResult;
  edit(id: string, recipe: DraftRecipe, meta?: EditMeta): void;
  undo(id: string): void;
  redo(id: string): void;
  /** Close without finishing: a session that was never edited and has no row is dropped; any other stays as a draft. */
  release(id: string): void;
  commit(id: string, choices?: ConflictChoices, section?: string): Promise<DraftCommitOutcome | { readonly ok: false; readonly reason: 'gone' }>;
  discard(id: string): Promise<void>;
  discardUnreadable(id: string): Promise<void>;
  /** Saves every dirty session now. */
  flush(): Promise<void>;
  /** A fresh ID for a record or a nested record the editor creates (for example a reagent profile, prefix "rpf"). */
  newId(prefix: string): string;
  /** Reads the stored rows again (after boot and after a promotion). */
  refresh(): Promise<void>;
  dispose(): void;
}
