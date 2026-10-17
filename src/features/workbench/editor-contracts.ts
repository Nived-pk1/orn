/**
 * The editor host's port (ADR-040): what the editors need of the app's session manager, as types and calls. The app fills it; a feature
 * never imports the app. The editor renders and edits through recipes over the draft; the core decides what is valid.
 */
import type { DraftCommitOutcome, EditorSession } from '@/core/commands';
import type { ConflictChoices, DraftRecipe, EditMeta } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import type { DraftSaveView, DraftsViewModel } from './contracts';

/** One open session as the editor sees it (the manager replaces the object when anything about it changes). */
export interface EditorEntryView {
  readonly id: string;
  readonly session: EditorSession;
  readonly save: DraftSaveView;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type EditorCommitResult = DraftCommitOutcome | { readonly ok: false; readonly reason: 'gone' };

export interface EditorPort {
  entry(id: string): EditorEntryView | undefined;
  /** Fires when any session, the draft count or the record store changes. */
  subscribe(listener: () => void): () => void;
  /** Whether drafts are kept (`stored`), kept in memory only (`memory`) or editing is unavailable here (`read_only`). */
  keeping(): DraftsViewModel['keeping'];
  edit(id: string, recipe: DraftRecipe, meta?: EditMeta): void;
  undo(id: string): void;
  redo(id: string): void;
  /** Close without finishing: a never-edited session is dropped, an edited one stays as a draft. */
  release(id: string): void;
  commit(id: string, choices?: ConflictChoices, section?: string): Promise<EditorCommitResult>;
  discard(id: string): Promise<void>;
  /** Warnings on a record after a save, for "Saved, 1 warning". */
  warningsOf(ref: RecordRef): number;
  /** Injected timers (the 300 ms debounce of the live panel). */
  readonly timers: { after(ms: number, run: () => void): () => void };
}
