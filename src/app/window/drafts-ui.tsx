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

/** What the window offers to open: the drafts list and the names editor. Absent in a window that has none (a test of one part). */
export interface EditorsApi {
  openDrafts(): void;
  /** Opens (or reopens) the names editor of a record. Answers nothing: a refusal is said in a toast. */
  editNames(ref: RecordRef): void;
  /** Opens the editor on a NEW species (step 6.2a, decision D3). A refusal is said in a toast. */
  newSpecies(): void;
  /** Opens the editor on a NEW class (step 6.2b, decision D5). A refusal is said in a toast. */
  newClass(): void;
  /** Opens the editor on a NEW reagent (step 6.2b, decision D5). A refusal is said in a toast. */
  newReagent(): void;
  /** Opens the editor on a NEW reaction (step 6.3a, decision D4). A refusal is said in a toast. */
  newReaction(): void;
  /** Opens the editor on a NEW mechanism (step 6.5a, decision D6). A refusal is said in a toast. */
  newMechanism(): void;
  /** Opens the editor on a NEW source, a record of kind `reference` (step 6.6a, decision C2). A refusal is said in a toast. */
  newSource(): void;
  /** Opens the editor on a NEW concept (step 6.6b, decision N1). A refusal is said in a toast. */
  newConcept(): void;
  /** Opens the editor on a NEW named reaction (step 6.6b, decision N2). A refusal is said in a toast. */
  newNamedReaction(): void;
  /** Opens the editor on a NEW transformation (step 6.6b, decision N3). A refusal is said in a toast. */
  newTransformation(): void;
  /** Opens the editor on a NEW relationship (step 6.6b, decision N5). A refusal is said in a toast. */
  newRelationship(): void;
  /** Opens the editor on a NEW caveat (step 6.6b, decision N6). A refusal is said in a toast. */
  newCaveat(): void;
  /** Opens the editor on a NEW topic (step 6.6c, decision M1). A refusal is said in a toast. */
  newTopic(): void;
  /** Opens the editor on a NEW topic mapping (step 6.6c, decision M2). A refusal is said in a toast. */
  newTopicMapping(): void;
  /** Opens the editor on a NEW record of this kind with some fields already filled in (step 6.6c: "Map to a topic" and the like). */
  startNew(kind: RecordKind, seed: Readonly<Record<string, unknown>>): void;
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
