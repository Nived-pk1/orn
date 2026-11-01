/**
 * The ONE interface the Mechanisms view needs from outside (step 7.4, as the Named reactions view's ports): the canonical store and indexes
 * (read only), the UI stores it reads and writes, and the renderers and actions of other features that it reuses (handed in as functions:
 * features never import each other). `src/app` fills it; the feature imports no `src/app`. Nothing here edits a record.
 */
import type { ReactNode } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef, StructureRep } from '@/core/schema';
import type { ActiveExamStore, InspectorStore, PageListStore } from '@/ui/state';
import type { CardArgs } from '@/ui/study-page';

export interface MechanismPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  readonly ui: {
    readonly mechanisms: PageListStore;
    readonly exam: ActiveExamStore;
    readonly inspector: InspectorStore;
  };
  /** The reaction's family card, unchanged (examples folded, "Show full equation", the boxes as written). */
  renderCard(args: CardArgs): ReactNode;
  /** Rich text as the inspector draws it. */
  renderRichText(source: string | undefined): ReactNode;
  /** The record's pictures as the inspector draws them (nothing when it has none). */
  renderPictures(ref: RecordRef): ReactNode;
  /** A step species' inline structure, drawn small as the inspector draws it (a drawing, or its text while it is drawn). */
  renderStructure(structure: StructureRep, name: string): ReactNode;
  /** Shows a record in the inspector (the pane opens). */
  select(ref: RecordRef): void;
  /** Shows a reaction in the inspector, as a card on a family page does. */
  selectReaction(reactionId: string): void;
  /** Opens a chapter's page in the Chapters view. */
  openChapter(chapterId: string): void;
  /** Studio only: opens the record's editor. Absent in Study. */
  readonly edit?: (mechanismId: string) => void;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
}
