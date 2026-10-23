/** The editors' api and the type of their lazy controller: types only, a leaf (so `context.tsx` can name them without a cycle; step 6.9 Z3). */
import type { RecordKind, RecordRef } from '@/core/schema';
import type { ComponentType } from 'react';
import type { NewEntry, QuickEntryRow } from './editor-entries';

/** What the window offers to open: the drafts list and the names editor. Absent in a window that has none (a test of one part). */
export interface EditorsApi {
  openDrafts(): void;
  /** Delete (step 6.8a): shows the impact dialog for this record; Delete is unavailable in a read-only tab. */
  requestDelete?(ref: RecordRef): void;
  /** Opens (or reopens) the names editor of a record. Answers nothing: a refusal is said in a toast. */
  editNames(ref: RecordRef): void;
  /** Opens the editor on a NEW record of this kind, with some fields already filled in when a seed is given (every "New ..." button; step 6.6c: "Map to a topic" and the like). A refusal is said in a toast. */
  startNew(kind: RecordKind, seed: Readonly<Record<string, unknown>>): void;
  /** Duplicate a reaction, or start a specific reaction from a generic one (step 6.7a): asks once, then opens a NEW draft. */
  startFrom?(mode: 'duplicate' | 'specific', ref: RecordRef): void;
  /** The "New ..." entry points (the Workbench, phone More and the palette read this one list). Empty until the lazy chunk has loaded, after the first paint. */
  readonly entries: readonly NewEntry[];
  /** Quick entry (step 6.7b): its words, from the lazy entries table (absent until it has loaded), and how to open the dialog. */
  readonly quickEntry?: QuickEntryRow;
  openQuickEntry?(): void;
  /** Opens a listed draft (its stored session). */
  openDraft(id: string): void;
  /** Why editing is unavailable now (a read-only tab); undefined when it is available. */
  readonly editReason: string | undefined;
  /** Record kinds that open the full editor (species, classes, reagents, reactions, mechanisms, sources, concepts, named reactions and transformations). */
  readonly fullEditorKinds?: readonly string[];
  /** Record kinds with the shared Names type (core/editing/names.ts; the inspector reads them through its host, never imports them). */
  readonly namesKinds?: readonly string[];
}

/** The lazy controller of the editors (`editors-controller.tsx`), which publishes its api to the shell in `editors.tsx`. */
export type EditorsControllerType = ComponentType<{ readonly onApi: (api: EditorsApi) => void }>;
