/**
 * The preview of a reaction DRAFT (step 6.3b decision D2): the reaction as its card will show it, built by the SAME builders as the card's
 * "Show full equation" (`groupOutcomes`, `fullEquationOfGroup`; the same arrow text, words and terms) from a draft that is in no store and
 * no index. The state and indexes are only read (the describer's records, the draft's schemes, `displayOf`); nothing is written. A reaction
 * with no outcome keeps its reactants and its arrow and has no products (`fullEquationWithoutOutcome`). A draft the builders cannot read
 * (a participant or a product with no substance) is answered in words and nothing is built; a record that is gone is drawn by its ID, as on a card.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, Reaction, ReactionScheme } from '../schema';
import { createDescriber } from './family/describe';
import { fullEquationOfGroup, fullEquationWithoutOutcome, type EquationShape, type FullEquation, type GroupContext } from './full-equation';
import { groupOutcomes } from './outcome-groups';

/** One scheme of the preview: the group's equation and, when the reaction has several groups, its label. */
export interface PreviewGroup {
  readonly equation: FullEquation | EquationShape;
  readonly label?: string;
}

export type DraftPreview =
  | { readonly ok: true; readonly equations: readonly PreviewGroup[]; /** False: the reaction has no outcome (the products side is empty). */ readonly hasOutcomes: boolean }
  | { readonly ok: false; readonly missing: readonly string[] };

type Loose = Readonly<Record<string, unknown>>;
const isBag = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value);
const hasSubstance = (ref: unknown): boolean => isBag(ref) && (ref.kind === 'species' || ref.kind === 'class' || ref.kind === 'reagent') && typeof ref.id === 'string' && ref.id !== '';

/** What the builders need that a draft may lack, said in words; empty: the draft can be built. */
function missingOf(draft: unknown): readonly string[] {
  if (!isBag(draft)) return ['The draft is not a reaction.'];
  const missing: string[] = [];
  for (const list of ['participants', 'stages', 'conditionVariants', 'outcomes'] as const) if (!Array.isArray(draft[list])) missing.push(`The draft has no list of ${list === 'conditionVariants' ? 'condition variants' : list}.`);
  if (!isBag(draft.reversibility)) missing.push('The draft has no reversibility.');
  if (missing.length > 0) return missing;
  (draft.participants as unknown[]).forEach((participant, index) => {
    if (!isBag(participant) || !hasSubstance(participant.ref)) missing.push(`Participant ${index + 1} has no substance.`);
  });
  (draft.outcomes as unknown[]).forEach((outcome, at) => {
    const products = isBag(outcome) ? outcome.products : undefined;
    if (!Array.isArray(products)) missing.push(`Outcome ${at + 1} has no list of products.`);
    else products.forEach((product, index) => void (isBag(product) && hasSubstance(product.ref) ? undefined : missing.push(`Product ${index + 1} of outcome ${at + 1} has no substance.`)));
  });
  return missing;
}

/** The equations of `draft` as the card shows them: one per group of outcomes, or the reactants and the arrow when there is no outcome. */
export function previewOfDraft(state: CanonicalState, indexes: ReadonlyIndexes, draft: unknown): DraftPreview {
  const missing = missingOf(draft);
  if (missing.length > 0) return { ok: false, missing };
  const reaction = draft as Reaction;
  try {
    const describer = createDescriber(state);
    const schemes = [...new Set(indexes.referrersOf(reaction.id).filter((r) => r.owner.kind === 'reaction_scheme').map((r) => r.owner.id))]
      .map((id) => state.records.reaction_scheme[id])
      .filter((scheme): scheme is ReactionScheme => scheme !== undefined);
    const context: GroupContext = { schemes, describe: describer.describeForArrow, substanceOf: describer.substanceOf, shownAsNode: (ref) => indexes.displayOf(ref)?.showAsNode !== 'never' };
    if (reaction.outcomes.length === 0) return { ok: true, hasOutcomes: false, equations: [{ equation: fullEquationWithoutOutcome(reaction, context) }] };
    const groups = groupOutcomes(reaction.outcomes);
    return {
      ok: true,
      hasOutcomes: true,
      equations: groups.map((group, index): PreviewGroup => {
        const equation = fullEquationOfGroup(reaction, group.outcomes, context);
        if (groups.length < 2) return { equation };
        const named = group.outcomes.flatMap((outcome) => outcome.label ?? []);
        return { equation, label: named.length > 0 ? named.join(' and ') : `Outcome ${index + 1}` };
      }),
    };
  } catch (error) {
    return { ok: false, missing: [`The draft could not be drawn yet: ${error instanceof Error ? error.message : 'unknown problem'}.`] };
  }
}
