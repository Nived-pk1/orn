/**
 * Full equation (step 5.9a review, follow-up b): one outcome of a reaction written out as an equation, as plain structured text.
 * Every reactant with its coefficient (a species nobody draws as a node, water for one, is listed like any other), every product of
 * the outcome with its selectivity word (the SAME word the card shows under a main product, `selectivity-word.ts`; none when unspecified)
 * or, for a product that is not a main product, its role word ("coproduct", "byproduct"), and the
 * reagents and conditions over the arrow as the card writes them (`arrowTextOf`, so the 7-character formula rule applies there) EXCEPT
 * that a species already written on the left is not repeated on the arrow (a reagent that is the same record as a reactant, a gas of the
 * atmosphere with a reactant's formula). Text only: no markup; the renderer sets formulas in their typography.
 * A reactant that applies only under other condition variants than the outcome's is left out, as on the arrow.
 *
 * A GROUP (outcome groups step): the outcomes of one reaction that share their condition-variant set are ONE equation, the reactants and
 * the arrow once; the products are the main products of every outcome in the group's order, each outcome's word on its last main product
 * (with its regiochemistry), then the coproducts and byproducts of all of them, a species shared by several outcomes (the same record,
 * never matched by name or formula) written ONCE.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, ConditionVariantId, Outcome, ParticipantId, Reaction, ReactionScheme, RecordRef } from '../schema';
import type { TermSubstance } from './equation-term';
import { createDescriber } from './family/describe';
import { selectivityWordOf, type SelectivityWord } from './selectivity-word';
import { appliesTo, arrowTextOf, type ArrowText, type ArrowTextContext } from './arrow-text';
import { groupOutcomes } from './outcome-groups';

export interface EquationTerm {
  /** "2" for a coefficient of 2; null when none is stored or it is 1. */
  readonly coefficient: string | null;
  /** The name as written in the record (the wording as entered wins), or its ID when the record is gone. */
  readonly name: string;
  /** Set on ONE main product per outcome, its last: the outcome's selectivity word ("exclusive", "major", ...), written once for the outcome (INV-08); null on every other term and when none is stored. */
  readonly word: SelectivityWord | null;
  /** "both" (two main products) or "all" (three or more) on the term that carries `word` when the outcome has several main products; null otherwise. */
  readonly quantifier: SelectivityQuantifier | null;
  /** Set on a product that is not a main product: its role word; null otherwise. */
  readonly role: ProductRoleWord | null;
  /**
   * The outcome's regiochemistry as stored ("Saytzeff"), on the term that carries the outcome's word ONLY when the equation holds several
   * outcomes of one group (it tells them apart). Shown after the word ("major · Saytzeff"); not part of `text`. Null otherwise.
   */
  readonly regiochemistry: string | null;
  /** The term as one plain line: "2 Benzaldehyde", "Ethanal (exclusive)", "Water (byproduct)". */
  readonly text: string;
  /** The record behind the term (equation step, part 5): the species, class or reagent the participant or product names. */
  readonly ref: RecordRef;
  /** What the textbook equation needs of that record: name, structure, entered formula, charge (`missing` when the record is gone). */
  readonly substance: TermSubstance;
}

export interface FullEquation {
  /** The outcome (the FIRST of the group when the equation holds several). */
  readonly outcomeId: Outcome['id'];
  /** Every outcome the equation holds: one, or the outcomes of one group (same condition-variant set), in the group's order. */
  readonly outcomeIds: readonly Outcome['id'][];
  readonly reactants: readonly EquationTerm[];
  readonly products: readonly EquationTerm[];
  /** Reagents, catalysts and conditions over and under the arrow, as on the card. */
  readonly arrow: ArrowText;
  /** The reaction is stored as an equilibrium (`reversibility.kind` is `equilibrium`): the arrow is drawn as one (equation step, part 5). */
  readonly equilibrium: boolean;
  /**
   * One outcome: the equation without the arrow text, "2 Benzaldehyde → Benzyl alcohol + Sodium benzoate". Several outcomes (a group):
   * ONE sentence for a screen reader, "(R)-2-Bromobutane with alc. KOH, heat gives But-2-ene (major) and But-1-ene (minor)".
   */
  readonly text: string;
}

const coefficientText = (value: number | undefined): string | null => (value === undefined || value === 1 ? null : String(value));

/** The words for a product that is not a main product (selectivity lives on the outcome and is worded on the main products only). */
export type ProductRoleWord = 'coproduct' | 'byproduct';

/** Said before the selectivity word when an outcome has several main products: "(both exclusive)", "(all exclusive)". */
export type SelectivityQuantifier = 'both' | 'all';

const termText = (coefficient: string | null, name: string, word: string | null): string =>
  `${coefficient === null ? '' : `${coefficient} `}${name}${word === null ? '' : ` (${word})`}`;

const refKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

/** Joins "a", "a and b", "a, b and c". */
const andList = (items: readonly string[]): string => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

/** The arrow's words as the card joins them: ", " between parts, a space after a stage number. */
const arrowWords = (arrow: ArrowText): string => {
  const parts = [...arrow.above, ...arrow.below].filter((part) => part.kind !== 'more');
  return parts.map((part, index) => `${index === 0 ? '' : parts[index - 1]?.kind === 'separator' ? ' ' : ', '}${part.text}`).join('');
};

export type GroupContext = Omit<ArrowTextContext, 'conditionVariantIds' | 'carriedParticipantId' | 'omitReactants'> & { readonly substanceOf?: (ref: RecordRef) => TermSubstance };

/** An equation without its outcome IDs: what a reaction with NO outcome can show (the reactants and the arrow). */
export type EquationShape = Omit<FullEquation, 'outcomeId' | 'outcomeIds'>;

/** One group of outcomes (same condition-variant set, in the group's order) as ONE equation. One outcome: the equation of that outcome. */
export function fullEquationOfGroup(reaction: Reaction, outcomes: readonly Outcome[], context: GroupContext): FullEquation {
  const first = outcomes[0];
  if (first === undefined) throw new Error('fullEquationOfGroup needs at least one outcome');
  return { outcomeId: first.id, outcomeIds: outcomes.map((o) => o.id), ...buildEquation(reaction, outcomes, first.conditionVariantIds, context) };
}

/**
 * A reaction with NO outcome (a draft, step 6.3b): the reactants common to every variant and the arrow with the reagents and conditions
 * of the stages; the products side is empty. The same code as the equation of a group.
 */
export function fullEquationWithoutOutcome(reaction: Reaction, context: GroupContext): EquationShape {
  return buildEquation(reaction, [], [], context);
}

function buildEquation(reaction: Reaction, outcomes: readonly Outcome[], variantIds: readonly ConditionVariantId[], context: GroupContext): EquationShape {
  const several = outcomes.length > 1;
  const substanceOf = (ref: RecordRef, name: string): TermSubstance => context.substanceOf?.(ref) ?? { kind: 'missing', name };
  const nameOf = (ref: Parameters<ArrowTextContext['describe']>[0], written: string | undefined): string => {
    if (written !== undefined && written !== '') return written;
    const described = context.describe(ref);
    return described === undefined || described.name === '' ? ref.id : described.name;
  };
  const written = reaction.participants.filter((p) => p.role === 'reactant' && appliesTo(reaction, p.id as ParticipantId, variantIds));
  const reactants: EquationTerm[] = written.map((p) => {
    const coefficient = coefficientText(p.coefficient);
    const name = nameOf(p.ref, p.originalText);
    return {
      coefficient,
      name,
      word: null,
      quantifier: null,
      role: null,
      regiochemistry: null,
      text: termText(coefficient, name, null),
      ref: p.ref,
      substance: substanceOf(p.ref, name),
    };
  });
  const termOf = (p: Outcome['products'][number], word: SelectivityWord | null, quantifier: SelectivityQuantifier | null, regiochemistry: string | null): EquationTerm => {
    const coefficient = coefficientText(p.coefficient);
    const name = nameOf(p.ref, p.originalText);
    const role = p.role === 'main' ? null : p.role;
    return {
      coefficient,
      name,
      word,
      quantifier: word === null ? null : quantifier,
      role,
      regiochemistry,
      text: termText(coefficient, name, word === null ? role : quantifier === null ? word : `${quantifier} ${word}`),
      ref: p.ref,
      substance: substanceOf(p.ref, name),
    };
  };
  // the main products of each outcome in turn; selectivity lives on the outcome (INV-08), so it is worded ONCE per outcome, after its last main product
  const mains: EquationTerm[] = [];
  for (const outcome of outcomes) {
    const own = outcome.products.filter((p) => p.role === 'main');
    const quantifier: SelectivityQuantifier | null = own.length < 2 ? null : own.length === 2 ? 'both' : 'all';
    const regiochemistry = several && outcome.regiochemistry !== undefined && outcome.regiochemistry.trim() !== '' ? outcome.regiochemistry.trim() : null;
    own.forEach((p, index) => {
      const last = index === own.length - 1;
      mains.push(termOf(p, last ? selectivityWordOf(outcome.selectivity) : null, quantifier, last ? regiochemistry : null));
    });
  }
  // then the coproducts and byproducts, a species several outcomes share once (the same record)
  const extras: EquationTerm[] = [];
  const seen = new Set<string>();
  for (const outcome of outcomes) {
    for (const p of outcome.products) {
      if (p.role === 'main' || seen.has(refKey(p.ref))) continue;
      seen.add(refKey(p.ref));
      extras.push(termOf(p, null, null, null));
    }
  }
  const products = [...mains, ...extras];
  // what is written on the left is not written again on the arrow
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
  const words = arrowWords(arrow);
  const sentence = `${reactants.length === 0 ? 'nothing listed' : andList(reactants.map((t) => t.text))}${words === '' ? '' : ` with ${words}`} gives ${products.length === 0 ? 'nothing listed' : andList(products.map((t) => t.text))}`;
  return {
    reactants,
    products,
    arrow,
    equilibrium: reaction.reversibility.kind === 'equilibrium',
    text: several ? sentence : `${side(reactants)} → ${side(products)}`,
  };
}

/** One outcome as a full equation. */
export function fullEquationOf(reaction: Reaction, outcome: Outcome, context: GroupContext): FullEquation {
  return fullEquationOfGroup(reaction, [outcome], context);
}

/** Every GROUP of one reaction's outcomes as a full equation (`groupOutcomes`: in the order of each group's first outcome; the inspector's way in). */
export function fullEquationsOfReaction(state: CanonicalState, indexes: ReadonlyIndexes, reaction: Reaction): readonly FullEquation[] {
  const describer = createDescriber(state);
  const ids = new Set(
    indexes
      .referrersOf(reaction.id)
      .filter((r) => r.owner.kind === 'reaction_scheme')
      .map((r) => r.owner.id),
  );
  const schemes = [...ids].map((id) => state.records.reaction_scheme[id]).filter((s): s is ReactionScheme => s !== undefined);
  return groupOutcomes(reaction.outcomes).map((group) =>
    fullEquationOfGroup(reaction, group.outcomes, {
      schemes,
      describe: describer.describeForArrow,
      substanceOf: describer.substanceOf,
      shownAsNode: (ref) => indexes.displayOf(ref)?.showAsNode !== 'never',
    }),
  );
}
