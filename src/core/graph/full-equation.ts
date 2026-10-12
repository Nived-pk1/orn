/**
 * Full equation (step 5.9a review, follow-up b): one outcome of a reaction written out as an equation, as plain structured text.
 * Every reactant with its coefficient (a species nobody draws as a node, water for one, is listed like any other), every product of
 * the outcome with its role in words, and the reagents and conditions over the arrow exactly as the card writes them (`arrowTextOf`,
 * so the 7-character formula rule applies there). Text only: no markup; the renderer sets formulas in their typography.
 * A reactant that applies only under other condition variants than the outcome's is left out, as on the arrow.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, ConditionVariantId, Outcome, ParticipantId, Reaction, ReactionScheme } from '../schema';
import { createDescriber } from './family/describe';
import { appliesTo, arrowTextOf, type ArrowText, type ArrowTextContext } from './arrow-text';

export type ProductRoleWord = 'main' | 'coproduct' | 'byproduct';

export interface EquationTerm {
  /** "2" for a coefficient of 2; null when none is stored or it is 1. */
  readonly coefficient: string | null;
  /** The name as written in the record (the wording as entered wins), or its ID when the record is gone. */
  readonly name: string;
  /** Set on a product: its role in words. Null on a reactant. */
  readonly role: ProductRoleWord | null;
  /** The term as one plain line: "2 Benzaldehyde", "Water (byproduct)". */
  readonly text: string;
}

export interface FullEquation {
  readonly outcomeId: Outcome['id'];
  readonly reactants: readonly EquationTerm[];
  readonly products: readonly EquationTerm[];
  /** Reagents, catalysts and conditions over and under the arrow, as on the card. */
  readonly arrow: ArrowText;
  /** The equation without the arrow text: "2 Benzaldehyde → Benzyl alcohol (main) + Sodium benzoate (main)". */
  readonly text: string;
}

const coefficientText = (value: number | undefined): string | null => (value === undefined || value === 1 ? null : String(value));

const termText = (coefficient: string | null, name: string, role: ProductRoleWord | null): string =>
  `${coefficient === null ? '' : `${coefficient} `}${name}${role === null ? '' : ` (${role})`}`;

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
        role: null,
        text: termText(coefficient, name, null),
      };
    });
  const products: EquationTerm[] = outcome.products.map((p) => {
    const coefficient = coefficientText(p.coefficient);
    const name = nameOf(p.ref, p.originalText);
    return {
      coefficient,
      name,
      role: p.role,
      text: termText(coefficient, name, p.role),
    };
  });
  const arrow = arrowTextOf(reaction, {
    ...context,
    conditionVariantIds: variantIds,
    omitReactants: true,
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
