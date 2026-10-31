/**
 * The ONE interface the Chapters view needs from outside (step 7.3b, as the Reactions view's and the Precursors view's ports): the canonical
 * store and indexes (read only), the UI stores it reads and writes, how a record is named, and the renderers of the other features that a
 * study card reuses (handed in as functions: features never import each other). `src/app` fills it; the feature imports no `src/app`.
 */
import type { ReactNode } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { ActiveExamStore, ChaptersStore, InspectorStore } from '@/ui/state';

export interface ChapterCardArgs {
  readonly reactionId: string;
  readonly selected: boolean;
  readonly onSelect: (reactionId: string) => void;
  readonly outside?: string;
  /** The ids of this general reaction's examples that fold under its card. */
  readonly examples?: readonly string[];
  readonly selectedId?: string | null;
  readonly outsideOf?: (reactionId: string) => string | undefined;
  readonly fallback: (reason: string) => ReactNode;
}

export interface ChaptersPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  readonly ui: {
    readonly chapters: ChaptersStore;
    readonly exam: ActiveExamStore;
    readonly inspector: InspectorStore;
  };
  /** The record's display name. */
  nameOf(ref: RecordRef): string;
  /** Shows the record in the inspector (the pane opens). */
  select(ref: RecordRef): void;
  /** Shows a reaction in the inspector, as a card on a family page does. */
  selectReaction(reactionId: string): void;
  /** The family card of a whole reaction (examples folded, "Show full equation", the boxes as written). */
  renderCard(args: ChapterCardArgs): ReactNode;
  /** Rich text as the inspector draws it. */
  renderRichText(source: string | undefined): ReactNode;
  /** The pictures attached to a record. */
  renderPictures(ref: RecordRef): ReactNode;
  /** A species or a class as a box: its drawing (or generic formula) and its name. */
  renderSubstance(ref: RecordRef): ReactNode;
  /** A stored route: its name and numbered steps (the 7.2b layout). */
  renderRoute(routeId: string, selected: string | null, onSelect: (reactionId: string) => void): ReactNode;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
}
