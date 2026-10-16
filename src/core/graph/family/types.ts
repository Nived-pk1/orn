/**
 * The family study (step 5.5b; ADR-037): the value behind the navigator's family page. Plain data, derived from the navigator roll-up
 * index and never stored. A card holds record refs and text parts only: no markup, no copy of a record.
 */
import type { AnchorTone, ConditionVariantId, NamedReactionId, OutcomeId, ProductId, ReactionId, RecordRef, Review } from '../../schema';
import type { ArrowText } from '../arrow-text';
import type { FullEquation } from '../full-equation';

export type FamilySectionKind = 'reactions_of' | 'preparation_of';

import type { SelectivityWord } from '../selectivity-word';

/** The selectivity word shown under a product (the vocabulary of `../selectivity-word`); `unspecified` has none (the card then carries no word). */
export type { SelectivityWord };

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
  /** The whole outcome as an equation (every reactant, every product with its role): behind "Show full equation". */
  readonly equation?: FullEquation;
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
  /** The partner's own tone (step 5.5d, item e; additive): the strip's button takes it. Absent: the partner has none (the neutral button). */
  readonly tone?: AnchorTone;
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
  /** The family group and tone of the hub's anchor (step 5.5c); absent for Unclassified and for a hub without them. */
  readonly group?: string;
  readonly tone?: AnchorTone;
  readonly counts: { readonly reactionsOf: number; readonly preparationOf: number; readonly total: number };
  readonly reactionTypes: readonly FamilyReactionType[];
  /** Families this one is made from (preparation groups) and turns into (reaction groups), with reaction counts. */
  readonly madeFrom: readonly FamilyPartner[];
  readonly turnsInto: readonly FamilyPartner[];
  readonly reactionsOf: FamilySection;
  readonly preparationOf: FamilySection;
}
