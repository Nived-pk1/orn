/**
 * The window's side of the drafts and the editors (ADR-040): the count from the session manager, the one context that says how to open
 * the drafts list and an editor, and nothing else. What is here is what the entry chunk may hold; the list and the editor are lazy chunks
 * (`editors.tsx` loads them with `React.lazy`).
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { RecordKind, RecordRef } from '@/core/schema';
import type { DraftsView } from '@/app/services/drafts-types';
import { EDITING } from '@/app/edition';
import { useAppOptional } from './context';
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

export const EditorsContext = createContext<EditorsApi | null>(null);
export const useEditors = (): EditorsApi | null => useContext(EditorsContext);
/** How the window opens the drafts list; null where there is none. */
export const useDraftsOpen = (): (() => void) | null => useContext(EditorsContext)?.openDrafts ?? null;

const NO_DRAFTS: DraftsView = { items: [], count: 0, keeping: 'stored' };
const never = (): (() => void) => () => undefined;

/** The manager's cached view: the same object until something changes. Outside the app provider: no drafts. */
export function useDraftsView(): DraftsView {
  // Study never shows drafts: any stored in this browser (editors were public from 6.2 to 6.5) are left untouched and not listed
  const app = useAppOptional();
  const manager = EDITING ? app?.services.drafts : undefined;
  return useSyncExternalStore(manager?.subscribe ?? never, manager?.view ?? (() => NO_DRAFTS));
}
