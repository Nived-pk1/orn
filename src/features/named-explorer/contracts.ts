/**
 * The ONE interface the Named reactions view needs from outside (step 7.4, as the Reagents view's ports): the canonical store and indexes (read
 * only), the UI stores it reads and writes, and the renderers and actions of other features that it reuses (handed in as functions: features never
 * import each other). `src/app` fills it; the feature imports no `src/app`. Nothing here edits a record.
 */
import type { ReactNode } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { ActiveExamStore, InspectorStore, PageListStore } from '@/ui/state';
import type { CardArgs } from '@/ui/study-page';

export type NamedCardArgs = CardArgs;

export interface NamedPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  readonly ui: {
    readonly named: PageListStore;
    readonly exam: ActiveExamStore;
    readonly inspector: InspectorStore;
  };
  /** The reaction's family card, unchanged (examples folded, "Show full equation", the boxes as written). */
  renderCard(args: NamedCardArgs): ReactNode;
  /** Rich text as the inspector draws it. */
  renderRichText(source: string | undefined): ReactNode;
  /** The record's pictures as the inspector draws them (nothing when it has none). */
  renderPictures(ref: RecordRef): ReactNode;
  /** Shows a record in the inspector (the pane opens). */
  select(ref: RecordRef): void;
  /** Shows a reaction in the inspector, as a card on a family page does. */
  selectReaction(reactionId: string): void;
  /** Opens Reactions with the Named reaction filter set to this record. */
  showInReactions(namedReactionId: string): void;
  /** Opens a mechanism's page in the Mechanisms view. */
  openMechanism(mechanismId: string): void;
  /** Opens a chapter's page in the Chapters view. */
  openChapter(chapterId: string): void;
  /** Studio only: opens the record's editor. Absent in Study. */
  readonly edit?: (namedReactionId: string) => void;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
}
