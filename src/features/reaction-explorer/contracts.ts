/**
 * The ONE interface the Reactions view needs from outside (step 7.1b, as the navigator's and the search feature's ports): the canonical store
 * and indexes (read only), the UI stores it reads and writes, the substance search, what selecting a reaction does, the card host, timers
 * and a log. `src/app` fills it; the feature imports no `src/app` and no other feature. The CARD of a reaction is drawn by the navigator
 * feature's host, handed in here as `renderCard` (features never import each other).
 */
import type { ReactNode } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { ActiveExamStore, ExplorerStore, FamilyStore } from '@/ui/state';

export interface SubstanceHit {
  readonly ref: RecordRef;
  readonly title: string;
}

export type SubstanceSearchAnswer = { readonly ok: true; readonly hits: readonly SubstanceHit[] } | { readonly ok: false; readonly message: string };

export interface CardArgs {
  readonly reactionId: string;
  readonly selected: boolean;
  readonly onSelect: (reactionId: string) => void;
  /** "outside JEE Main" when the reaction is outside the chosen exam scope. */
  readonly outside?: string;
  /** 7.3a C1: the ids of this GENERAL reaction's examples that fold under its card (folded name, then id); absent: none. */
  readonly examples?: readonly string[];
  /** 7.3a C2: the general reaction this card is an example of, when that card is not in the list. */
  readonly exampleOf?: { readonly id: string; readonly name: string };
  /** The selected reaction (an example inside the disclosure shows it) and the outside words of an example (C5). */
  readonly selectedId?: string | null;
  readonly outsideOf?: (reactionId: string) => string | undefined;
  /** Drawn instead of a card when the reaction has none, with the reason in words. */
  readonly fallback: (reason: string) => ReactNode;
}

export interface ExplorerPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  readonly ui: {
    readonly explorer: ExplorerStore;
    readonly exam: ActiveExamStore;
    readonly family: FamilyStore;
  };
  /** Species, classes and reagents whose names match the text (Study-safe: the search service, no editing code). A newer ask supersedes an older one. */
  searchSubstances(text: string): Promise<SubstanceSearchAnswer>;
  /** Selects a reaction as a card on the family page does: the inspector shows it. */
  select(reactionId: string): void;
  renderCard(args: CardArgs): ReactNode;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
}

/** The results are drawn this many at a time (E5). */
export const PAGE_SIZE = 30;
