/**
 * The reaction filter's vocabulary (step 7.1a, ADR-042 E2-E5). Plain data; nothing here is stored.
 */
import type { ReviewStatus } from '../../editing';

/** How a chosen substance is used in the reaction (E2). `any` is reactant, arrow or product; a spectator is never any of them. */
export type SubstanceUse = 'reactant' | 'arrow' | 'product' | 'any';

/**
 * Every dimension is optional. Dimensions combine with AND; the values inside one dimension with OR. Ids are record ids: a species, class or
 * reagent for `substanceIds` (DIRECT references only), a hub id (a class, or the Unclassified hub) for the families, a concept id for the
 * types, a named reaction id.
 */
export interface ReactionFilter {
  readonly substanceIds?: readonly string[];
  /** Default `any`. Only means something while `substanceIds` is not empty. */
  readonly usedAs?: SubstanceUse;
  readonly fromFamilyIds?: readonly string[];
  readonly toFamilyIds?: readonly string[];
  readonly typeIds?: readonly string[];
  readonly namedReactionIds?: readonly string[];
  readonly reviewStatuses?: readonly ReviewStatus[];
  /** Folded text in the name and the aliases. */
  readonly text?: string;
  /** "Only <exam version>": hide the reactions outside the chosen exam scope. */
  readonly onlyInScope?: boolean;
}

export interface ReactionFilterRow {
  readonly id: string;
  readonly name: string;
  /** The hubs of the reaction's carried substrates (the family page's "from" sets); empty: it is on no family page. */
  readonly fromFamilyIds: readonly string[];
  readonly toFamilyIds: readonly string[];
  /** Marked outside the chosen exam scope (always false without one). */
  readonly outside: boolean;
  /** The ids of the reaction's types (concepts). */
  readonly typeIds: readonly string[];
}

export interface FacetOption {
  readonly id: string;
  readonly count: number;
}

/** Per dimension: the options with the number of reactions that match when that dimension's own choice is ignored. Sorted by id. */
export interface ReactionFacets {
  readonly substance: readonly FacetOption[];
  readonly fromFamily: readonly FacetOption[];
  readonly toFamily: readonly FacetOption[];
  readonly type: readonly FacetOption[];
  readonly namedReaction: readonly FacetOption[];
  readonly reviewStatus: readonly FacetOption[];
}

export interface ReactionFilterResult {
  /** The matching reactions in folded-name then ID order. */
  readonly rows: readonly ReactionFilterRow[];
  /** Every reaction before any filter. */
  readonly total: number;
  /** Reactions the other filters let through that "Only <exam version>" hides. */
  readonly hiddenByScope: number;
  readonly facets: ReactionFacets;
}
