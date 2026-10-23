/**
 * The editor host's port (ADR-040): what the editors need of the app's session manager, as types and calls. The app fills it; a feature
 * never imports the app. The editor renders and edits through recipes over the draft; the core decides what is valid.
 */
import type { DraftCommitOutcome, EditorSession } from '@/core/commands';
import type { ConflictChoices, DraftRecipe, EditMeta } from '@/core/editing';
import type { RecordKind, RecordRef } from '@/core/schema';
import type { RecordPickerPort } from './record-picker-contracts';
import type { StructurePort } from './structure-contracts';
import type { DraftChecksPort } from './check-contracts';
import type { PreviewPort } from './preview-contracts';
import type { DuplicatePort } from './duplicate-contracts';
import type { MechanismLinksPort } from './mechanism-contracts';
import type { PicturesPort } from './picture-contracts';
import type { MergePort } from './merge-contracts';
import type { DraftSaveView, DraftsViewModel } from './contracts';
import type { CreateNewApi } from './create-new';

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
  /** The reaction editor's live preview (step 6.3b D2); absent: the editor shows no preview. */
  readonly preview?: PreviewPort;
  /** Which outcomes use a mechanism variant, and whether a linked record exists (step 6.5a); absent: nothing is known about links. */
  readonly links?: MechanismLinksPort;
  /** The mechanism editor's pictures, saved at once outside the draft (step 6.5b); absent: no Pictures section. */
  readonly pictures?: PicturesPort;
  /** Another editor in place of this one (step 6.6c): a NEW record of a kind with fields already filled in, or an existing record's editor. The host closes this editor first and keeps its draft. */
  readonly chain?: { start(kind: RecordKind, seed: Readonly<Record<string, unknown>>): void; edit(ref: RecordRef): void; /** Duplicate a saved reaction or start a specific one from a generic one (step 6.7a); the window asks first and then opens a NEW draft. */ from?(mode: 'duplicate' | 'specific', ref: RecordRef, unsaved?: boolean): void; /** Delete (step 6.8a): the window shows the impact dialog for this record. */ remove?(ref: RecordRef): void };
  /** True when this session edits a saved record that no longer exists (deleted here or in another tab): the editor then shows "This record was deleted" (step 6.8a). */
  gone?(id: string): boolean;
  /** "Create new" in the pickers (step 6.7a): opens a nested editor over this one; absent: the pickers show no Create new row. A nested editor gets `nested: true` and no `chain`. */
  readonly createNew?: CreateNewApi;
  /** Merge A into B (step 6.8a): the candidates, the preview and the merge; absent: no "Merge into..." and the duplicate dialog's Merge is unavailable. */
  readonly merge?: MergePort;
  /** The structure panel's parse and drawing; absent: the panel reads nothing (the text is still kept). */
  readonly structure?: StructurePort;
  /** A fresh ID for a nested record the form creates (a reagent profile: 'rpf'). From the session manager's ID factory; deterministic under test. */
  newId(prefix: string): string;
  /** The injected clock as an ISO time (the Review section stamps `reviewedAt`); absent: the section cannot mark a record verified. */
  now?(): string;
  /** Injected timers (the 300 ms debounce of the live panel). */
  readonly timers: { after(ms: number, run: () => void): () => void };
}
