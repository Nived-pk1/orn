/**
 * The ONE interface the Reagents view needs from outside (step 7.3c, as the Chapters view's ports): the canonical store and indexes (read only),
 * the UI stores it reads and writes, how conditions are worded, and the renderers and actions of other features that it reuses (handed in as
 * functions: features never import each other). `src/app` fills it; the feature imports no `src/app`. Nothing here edits a record.
 */
import type { ReactNode } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { ConditionParameters, RecordRef, CanonicalState } from '@/core/schema';
import type { ActiveExamStore, InspectorStore, ReagentsStore } from '@/ui/state';

export interface ReagentCardArgs {
  readonly reactionId: string;
  readonly selected: boolean;
  readonly onSelect: (reactionId: string) => void;
  /** "outside JEE Main" when the reaction is outside the chosen exam scope. */
  readonly outside?: string;
  /** The ids of this general reaction's examples that fold under its card. */
  readonly examples?: readonly string[];
  readonly selectedId?: string | null;
  readonly outsideOf?: (reactionId: string) => string | undefined;
  readonly fallback: (reason: string) => ReactNode;
}

export interface ReagentsPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  readonly ui: {
    readonly reagents: ReagentsStore;
    readonly exam: ActiveExamStore;
    readonly inspector: InspectorStore;
  };
  /** The reaction's family card, unchanged (examples folded, "Show full equation", the boxes as written). */
  renderCard(args: ReagentCardArgs): ReactNode;
  /** The record's display name. */
  nameOf(ref: RecordRef): string;
  /** A profile's conditions in words (the inspector's phrases): stored values, nothing converted. */
  conditionPhrases(parameters: ConditionParameters): readonly string[];
  /** Rich text as the inspector draws it. */
  renderRichText(source: string | undefined): ReactNode;
  /** Shows a record in the inspector (the pane opens). */
  select(ref: RecordRef): void;
  /** Shows a reaction in the inspector, as a card on a family page does. */
  selectReaction(reactionId: string): void;
  /** Opens Reactions with the Substance filter set to this reagent. */
  showInReactions(reagentId: string): void;
  /** Studio only: opens the reagent's editor. Absent in Study. */
  readonly edit?: (reagentId: string) => void;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
}

/** A list or a section is drawn this many at a time. */
export const PAGE_SIZE = 30;
