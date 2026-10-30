/**
 * The ONE interface the Precursors view needs from outside (step 7.2a, as the Reactions view's): the canonical store and indexes (read
 * only), the UI stores it reads and writes, the substance search, route search, what selecting a reaction does, the card host, timers and a
 * log. `src/app` fills it; the feature imports no `src/app` and no other feature. The CARD of a reaction is drawn by the navigator
 * feature's host, handed in as `renderCard` (features never import each other).
 */
import type { ReactNode } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { RouteQuery, RouteSearchResult } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { ActiveExamStore, ExplorerStore, FamilyStore, PrecursorsStore } from '@/ui/state';

export interface SubstanceHit {
  readonly ref: RecordRef;
  readonly title: string;
}

export type SubstanceSearchAnswer = { readonly ok: true; readonly hits: readonly SubstanceHit[] } | { readonly ok: false; readonly message: string };

export type RoutesAnswer =
  | { readonly ok: true; readonly result: RouteSearchResult }
  | { readonly ok: false; readonly message: string; readonly cancelled?: true };

export interface CardArgs {
  readonly reactionId: string;
  readonly selected: boolean;
  readonly onSelect: (reactionId: string) => void;
  /** "outside JEE Main" when the reaction is outside the chosen exam scope. */
  readonly outside?: string;
  /** 7.3a C1, C2, C5: the ids of this general reaction's folded examples, the general reaction this card is an example of, the selected reaction and the outside words of an example. */
  readonly examples?: readonly string[];
  readonly exampleOf?: { readonly id: string; readonly name: string };
  readonly selectedId?: string | null;
  readonly outsideOf?: (reactionId: string) => string | undefined;
  /** Drawn instead of a card when the reaction has none, with the reason in words. */
  readonly fallback: (reason: string) => ReactNode;
}

export interface PrecursorPorts {
  readonly store: {
    getState(): CanonicalState;
    subscribe(listener: (changes: ChangeSet) => void): () => void;
  };
  readonly indexes: { current(): ReadonlyIndexes };
  readonly ui: {
    readonly precursors: PrecursorsStore;
    /** Cards or Compact is the Reactions view's own choice, shared. */
    readonly explorer: ExplorerStore;
    readonly exam: ActiveExamStore;
    /** The selected reaction, as on the family page. */
    readonly family: FamilyStore;
  };
  /** Species and classes whose names match the text (Study-safe: the search service). A newer ask supersedes an older one. */
  searchSubstances(text: string): Promise<SubstanceSearchAnswer>;
  /** Route search in the compute worker; cancellable by the signal. */
  findRoutes(query: RouteQuery, signal?: AbortSignal): Promise<RoutesAnswer>;
  /** Opens the Reactions view filtered to this compound as a Product (the by-product line). */
  showReactionsMaking(ref: RecordRef): void;
  /** Studio only: opens the route editor on a NEW draft filled from a found route (nothing is saved). Absent in Study: no "Save as route" button. */
  saveAsRoute?(route: { readonly steps: readonly { readonly reactionId: string; readonly outcomeId: string; readonly conditionVariantIds: readonly string[] }[]; readonly target: RecordRef }): void;
  /** Shows a saved route in the inspector. */
  openRoute?(routeId: string): void;
  /** Selects a reaction as a family-page card does: the inspector shows it. */
  select(reactionId: string): void;
  renderCard(args: CardArgs): ReactNode;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly log: (type: string, message: string) => void;
}
