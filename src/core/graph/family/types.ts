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
  /** The text the reaction writes for a CLASS product (its `originalText`), drawn in the box instead of the class's generic formula (7.3b A5); absent for a species or when none is stored. */
  readonly writtenAs?: string;
}

/** One outcome of a reaction, as it lands in the card's family group: its main products that resolve to the group. */
export interface FamilyCardOutcome {
  readonly outcomeId: OutcomeId;
  readonly conditionVariantIds: readonly ConditionVariantId[];
  readonly products: readonly FamilyProduct[];
  /** The stored selectivity (`exclusive` ... `unspecified`): the group's order reads it. */
  readonly selectivity: string;
  /** The stored regiochemistry text, as written; absent when the outcome has none. */
  readonly regiochemistry?: string;
  /**
   * The word under each of its main products: the selectivity word, and in a group of several outcomes the regiochemistry after a middle dot
   * ("major · Saytzeff"); null when there is none. A group of one outcome shows the selectivity word alone (as before the groups).
   */
  readonly word: string | null;
}

/**
 * The outcomes of one card that share their condition-variant set (outcome groups step): drawn as ONE scheme, the reactants and the arrow
 * once, each outcome's main products on the products side. The order is the group rule's (`../outcome-groups`).
 */
export interface FamilyOutcomeGroup {
  /** The variant set as a string; unique within the card. Empty: all variants. */
  readonly key: string;
  readonly conditionVariantIds: readonly ConditionVariantId[];
  /** The conditions of the group in words ("At 413 K"): the header of its block when the card has several groups. */
  readonly heading: string;
  readonly outcomes: readonly FamilyCardOutcome[];
  /** The one arrow of the group's scheme. */
  readonly arrowText: ArrowText;
  /** The group as one equation (every reactant, the main products of every outcome with their words, the shared coproducts once): behind "Show full equation". */
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
  /** The text the reaction writes for a CLASS substrate (7.3b A5); absent for a species or when none is stored. */
  readonly substrateWrittenAs?: string;
  /** Outcome groups in the order of their first outcome in the record; one group: no header on the card. */
  readonly groups: readonly FamilyOutcomeGroup[];
  readonly elsewhere: readonly FamilyElsewhere[];
  /** 7.3a C1: the examples of this GENERAL reaction that are folded under its card in this list (folded name, then id); absent: none. */
  readonly examples?: readonly FamilyCard[];
  /** 7.3a C2: this card's reaction is an example of a general reaction whose card is NOT in this list; absent: it is not (or is folded). */
  readonly exampleOf?: { readonly reactionId: string; readonly name: string };
}

export interface FamilyGroup {
  /** The partner family: the hub of the main product (reactions of) or of the carried substrate (preparation of). */
  readonly hubId: string;
  readonly name: string;
  /** The cards of the group: examples folded under their general reaction are not cards of their own (7.3a). */
  readonly cards: readonly FamilyCard[];
  /** How many reactions are folded under cards of this group. */
  readonly exampleCount: number;
}

export interface FamilySection {
  readonly kind: FamilySectionKind;
  /** Distinct CARDS of the section (7.3a C3). */
  readonly reactionCount: number;
  /** Distinct reactions that are folded examples and no card of this section: "(+ n examples)". */
  readonly exampleCount: number;
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
  readonly counts: { readonly reactionsOf: number; readonly preparationOf: number; readonly total: number; readonly examples: number };
  readonly reactionTypes: readonly FamilyReactionType[];
  /** Families this one is made from (preparation groups) and turns into (reaction groups), with reaction counts. */
  readonly madeFrom: readonly FamilyPartner[];
  readonly turnsInto: readonly FamilyPartner[];
  readonly reactionsOf: FamilySection;
  readonly preparationOf: FamilySection;
}
