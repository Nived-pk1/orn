/**
 * The editor host's port (ADR-040): what the editors need of the app's session manager, as types and calls. The app fills it; a feature
 * never imports the app. The editor renders and edits through recipes over the draft; the core decides what is valid.
 */
import type { DraftCommitOutcome, EditorSession } from '@/core/commands';
import type { ConflictChoices, DraftRecipe, EditMeta } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import type { RecordPickerPort } from './record-picker-contracts';
import type { StructurePort } from './structure-contracts';
import type { DraftChecksPort } from './check-contracts';
import type { DuplicatePort } from './duplicate-contracts';
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
  /** The live panel's checks (L1-L3 dry run, L4 of the structure); absent: only the schema check runs live. */
  readonly checks?: DraftChecksPort;
  /** The duplicate check on Save of a species and the way to show a record; absent: no check. */
  readonly duplicates?: DuplicatePort;
  /** The record pickers' search, words and cycle questions (step 6.2b decision D4); absent: records cannot be searched here. */
  readonly records?: RecordPickerPort;
  /** The structure panel's parse and drawing; absent: the panel reads nothing (the text is still kept). */
  readonly structure?: StructurePort;
  /** Injected timers (the 300 ms debounce of the live panel). */
  readonly timers: { after(ms: number, run: () => void): () => void };
}
