/**
 * Full equation (step 5.9a review, follow-up b): one outcome of a reaction written out as an equation, as plain structured text.
 * Every reactant with its coefficient (a species nobody draws as a node, water for one, is listed like any other), every product of
 * the outcome with its selectivity word (the SAME word the card shows under a main product, `selectivity-word.ts`; none when unspecified)
 * or, for a product that is not a main product, its role word ("coproduct", "byproduct"), and the
 * reagents and conditions over the arrow as the card writes them (`arrowTextOf`, so the 7-character formula rule applies there) EXCEPT
 * that a species already written on the left is not repeated on the arrow (a reagent that is the same record as a reactant, a gas of the
 * atmosphere with a reactant's formula). Text only: no markup; the renderer sets formulas in their typography.
 * A reactant that applies only under other condition variants than the outcome's is left out, as on the arrow.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, ConditionVariantId, Outcome, ParticipantId, Reaction, ReactionScheme } from '../schema';
import { createDescriber } from './family/describe';
import { selectivityWordOf, type SelectivityWord } from './selectivity-word';
import { appliesTo, arrowTextOf, type ArrowText, type ArrowTextContext } from './arrow-text';

export interface EquationTerm {
  /** "2" for a coefficient of 2; null when none is stored or it is 1. */
  readonly coefficient: string | null;
  /** The name as written in the record (the wording as entered wins), or its ID when the record is gone. */
  readonly name: string;
  /** Set on a MAIN product: the card's own selectivity word ("exclusive", "major", ...); null on a reactant, on a coproduct or byproduct, and on a product with none. */
  readonly word: SelectivityWord | null;
  /** Set on a product that is not a main product: its role word; null otherwise. */
  readonly role: ProductRoleWord | null;
  /** The term as one plain line: "2 Benzaldehyde", "Ethanal (exclusive)", "Water (byproduct)". */
  readonly text: string;
}

export interface FullEquation {
  readonly outcomeId: Outcome['id'];
  readonly reactants: readonly EquationTerm[];
  readonly products: readonly EquationTerm[];
  /** Reagents, catalysts and conditions over and under the arrow, as on the card. */
  readonly arrow: ArrowText;
  /** The equation without the arrow text: "2 Benzaldehyde → Benzyl alcohol + Sodium benzoate". */
  readonly text: string;
}

const coefficientText = (value: number | undefined): string | null => (value === undefined || value === 1 ? null : String(value));

/** The words for a product that is not a main product (selectivity lives on the outcome and is worded on the main products only). */
export type ProductRoleWord = 'coproduct' | 'byproduct';

const termText = (coefficient: string | null, name: string, word: SelectivityWord | ProductRoleWord | null): string =>
  `${coefficient === null ? '' : `${coefficient} `}${name}${word === null ? '' : ` (${word})`}`;

export function fullEquationOf(
  reaction: Reaction,
  outcome: Outcome,
  context: Omit<ArrowTextContext, 'conditionVariantIds' | 'carriedParticipantId' | 'omitReactants'>,
): FullEquation {
  const variantIds: readonly ConditionVariantId[] = outcome.conditionVariantIds;
  const nameOf = (ref: Parameters<ArrowTextContext['describe']>[0], written: string | undefined): string => {
    if (written !== undefined && written !== '') return written;
    const described = context.describe(ref);
    return described === undefined || described.name === '' ? ref.id : described.name;
  };
  const reactants: EquationTerm[] = reaction.participants
    .filter((p) => p.role === 'reactant' && appliesTo(reaction, p.id as ParticipantId, variantIds))
    .map((p) => {
      const coefficient = coefficientText(p.coefficient);
      const name = nameOf(p.ref, p.originalText);
      return {
        coefficient,
        name,
        word: null,
        role: null,
        text: termText(coefficient, name, null),
      };
    });
  const products: EquationTerm[] = outcome.products.map((p) => {
    const coefficient = coefficientText(p.coefficient);
    const name = nameOf(p.ref, p.originalText);
    // selectivity lives on the outcome (INV-08); the card words the main products it draws, so a coproduct or byproduct says its role instead
    const word = p.role === 'main' ? selectivityWordOf(outcome.selectivity) : null;
    const role = p.role === 'main' ? null : p.role;
    return {
      coefficient,
      name,
      word,
      role,
      text: termText(coefficient, name, word ?? role),
    };
  });
  // what is written on the left is not written again on the arrow
  const written = reaction.participants.filter((p) => p.role === 'reactant' && appliesTo(reaction, p.id as ParticipantId, variantIds));
  const arrow = arrowTextOf(reaction, {
    ...context,
    conditionVariantIds: variantIds,
    omitReactants: true,
    omitRefs: written.map((p) => p.ref),
    omitFormulas: written.flatMap((p) => {
      const formula = context.describe(p.ref)?.formula;
      return formula === undefined || formula === '' ? [] : [formula];
    }),
  });
  const side = (terms: readonly EquationTerm[]): string => (terms.length === 0 ? 'nothing listed' : terms.map((t) => t.text).join(' + '));
  return {
    outcomeId: outcome.id,
    reactants,
    products,
    arrow,
    text: `${side(reactants)} → ${side(products)}`,
  };
}

/** Every outcome of one reaction as a full equation, in the record's outcome order (the inspector's way in; indexes give the schemes). */
export function fullEquationsOfReaction(state: CanonicalState, indexes: ReadonlyIndexes, reaction: Reaction): readonly FullEquation[] {
  const describer = createDescriber(state);
  const ids = new Set(
    indexes
      .referrersOf(reaction.id)
      .filter((r) => r.owner.kind === 'reaction_scheme')
      .map((r) => r.owner.id),
  );
  const schemes = [...ids].map((id) => state.records.reaction_scheme[id]).filter((s): s is ReactionScheme => s !== undefined);
  return reaction.outcomes.map((outcome) =>
    fullEquationOf(reaction, outcome, {
      schemes,
      describe: describer.describeForArrow,
      shownAsNode: (ref) => indexes.displayOf(ref)?.showAsNode !== 'never',
    }),
  );
}
