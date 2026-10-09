/**
 * The family study (step 5.5b; ADR-037): the value behind the navigator's family page. Plain data, derived from the navigator roll-up
 * index and never stored. A card holds record refs and text parts only: no markup, no copy of a record.
 */
import type { ConditionVariantId, NamedReactionId, OutcomeId, ProductId, ReactionId, RecordRef, Review } from '../../schema';
import type { ArrowText } from '../arrow-text';

export type FamilySectionKind = 'reactions_of' | 'preparation_of';

/** The selectivity word shown under a product; `unspecified` has none (the card then carries no word). */
export type SelectivityWord = 'exclusive' | 'major' | 'minor' | 'trace' | 'mixture component';

export interface FamilyProduct {
  readonly productId: ProductId;
  readonly ref: RecordRef;
  readonly selectivity: SelectivityWord | null;
}

/** One outcome of a reaction, as it lands in the card's group: its main products that resolve to the group, and its arrow text. */
export interface FamilyCardOutcome {
  readonly outcomeId: OutcomeId;
  readonly conditionVariantIds: readonly ConditionVariantId[];
  readonly products: readonly FamilyProduct[];
  readonly arrowText: ArrowText;
}

/** Outcomes of the same reaction that land in OTHER groups of the same section: counted, with where they go, so nothing is hidden. */
export interface FamilyElsewhere {
  readonly hubId: string;
  readonly name: string;
  readonly outcomeCount: number;
  /** The condition words of those outcomes ("443 K"; several: joined with "; "); empty when they state none. */
  readonly conditionText: string;
}

export interface FamilyCard {
  /** Unique within the study: section, group and reaction. */
  readonly key: string;
  readonly reactionId: ReactionId;
  readonly name: string;
  readonly namedReactions: readonly { readonly id: NamedReactionId; readonly name: string }[];
  readonly reviewStatus: Review['status'];
  readonly caveatCount: number;
  /** The carried substrate (a ref). */
  readonly substrate: RecordRef;
  readonly outcomes: readonly FamilyCardOutcome[];
  readonly elsewhere: readonly FamilyElsewhere[];
}

export interface FamilyGroup {
  /** The partner family: the hub of the main product (reactions of) or of the carried substrate (preparation of). */
  readonly hubId: string;
  readonly name: string;
  readonly cards: readonly FamilyCard[];
}

export interface FamilySection {
  readonly kind: FamilySectionKind;
  readonly reactionCount: number;
  readonly groups: readonly FamilyGroup[];
}

/** A partner family with the number of reactions that connect it to this family in a direction. */
export interface FamilyPartner {
  readonly hubId: string;
  readonly name: string;
  readonly reactionCount: number;
}

export interface FamilyReactionType {
  readonly conceptId: string;
  readonly name: string;
  readonly count: number;
}

export interface FamilyStudy {
  readonly hubId: string;
  /** The anchored record, or null for Unclassified. */
  readonly hub: RecordRef | null;
  readonly name: string;
  readonly formula?: string;
  readonly counts: { readonly reactionsOf: number; readonly preparationOf: number; readonly total: number };
  readonly reactionTypes: readonly FamilyReactionType[];
  /** Families this one is made from (preparation groups) and turns into (reaction groups), with reaction counts. */
  readonly madeFrom: readonly FamilyPartner[];
  readonly turnsInto: readonly FamilyPartner[];
  readonly reactionsOf: FamilySection;
  readonly preparationOf: FamilySection;
}
