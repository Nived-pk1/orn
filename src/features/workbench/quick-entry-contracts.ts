/**
 * What the quick-entry dialog needs of the app (step 6.7b): names found through the search service, a structure question for the chem worker
 * and the duplicate check, the records already in the dataset, the live preview, the nested "Create new" editor and the reaction editor. The app
 * fills it (`src/app/window/quick-entry-port.ts`); the dialog decides no chemistry.
 */
import type { RecordRef } from '@/core/schema';
import type { TermRef } from '@/core/quick-entry/seed';
import type { PreviewPort } from './preview-contracts';
import type { RecordChoice } from './record-picker-contracts';

export interface FindResult {
  /** Records of a species, reagent or class whose name or alias equals the text (case-insensitively). */
  readonly exact: readonly RecordChoice[];
  /** The best other matches from search, at most five. */
  readonly suggestions: readonly RecordChoice[];
}

/** A term with no spaces asked of the chem worker: not a structure, one it could not read, an existing species with it, or a new one. */
export type StructureAnswer =
  | { readonly state: 'not_structure' }
  | { readonly state: 'unanswered'; readonly message: string }
  | { readonly state: 'matched'; readonly matches: readonly RecordChoice[] }
  | { readonly state: 'new' };

export interface QuickEntryPort {
  find(text: string): Promise<FindResult>;
  structure(text: string): Promise<StructureAnswer>;
  /** The record behind a term reference now (a name and kind words), or undefined when it is gone. */
  describe(ref: TermRef): RecordChoice | undefined;
  /** Existing reactions with the same participants and products (at most three). */
  similar(left: readonly TermRef[], products: readonly TermRef[]): readonly { readonly id: string; readonly name: string }[];
  /** Absent: no preview is drawn. */
  readonly preview: PreviewPort | undefined;
  /** The nested editor of "Create new" (step 6.7a); `done` gets the saved record. */
  createNew(kind: 'species' | 'reagent', seed: Readonly<Record<string, unknown>>, done: (ref: RecordRef) => void): void;
  /** Shows a record in the inspector. */
  openRecord(ref: RecordRef): void;
  /** Opens a NEW reaction draft seeded with this; nothing is saved. */
  open(seed: Readonly<Record<string, unknown>>): void;
  newId(prefix: string): string;
}
