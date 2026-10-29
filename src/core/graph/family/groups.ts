/**
 * The outcome groups of one card (outcome groups step, part 2): the outcomes that land in the card's family group, grouped by their
 * condition-variant set (`../outcome-groups`). Per group: ONE arrow text, ONE heading (the variant's conditions in words, used when the
 * card has several groups) and ONE equation, so the card draws the reactants and the arrow once per group. Pure; derived, never stored.
 */
import type { ConditionVariantId, Outcome, ParticipantId, Reaction, ReactionScheme } from '../../schema';
import { arrowTextOf, type ArrowText, type ArrowTextContext } from '../arrow-text';
import { fullEquationOfGroup } from '../full-equation';
import { groupOutcomes, outcomeWordOf } from '../outcome-groups';
import { selectivityWordOf } from '../selectivity-word';
import type { createDescriber } from './describe';
import type { FamilyCardOutcome, FamilyOutcomeGroup } from './types';

/** A card outcome before its word is known (the word depends on how many outcomes its group holds). */
export type OutcomeDraft = Omit<FamilyCardOutcome, 'word'>;

/**
 * The conditions of a group in words, the SAME words its arrow writes under it: "At 413 K" for a measured value, the words alone for
 * the others ("cold, basic medium"). A group whose arrow states none is headed by its variants' labels; a group of all variants by
 * "In all variants". Never empty.
 */
export function headingOf(arrow: ArrowText, variantLabels: readonly string[]): string {
  const conditions = arrow.below.filter((part) => part.kind === 'condition').map((part) => part.text);
  if (conditions.length > 0) {
    const text = conditions.join(', ');
    return /^[0-9−-]/.test(text) ? `At ${text}` : text;
  }
  return variantLabels.length === 0 ? 'In all variants' : variantLabels.join(' / ');
}

/** The measured and worded conditions of an arrow as its heading says them, without the "At" ("373 K, sealed tube"); empty when it states none. */
const conditionWordsOf = (arrow: ArrowText): string => arrow.below.filter((part) => part.kind === 'condition').map((part) => part.text).join(', ');

export interface GroupsContext {
  readonly schemes: readonly ReactionScheme[];
  readonly participantId: ParticipantId;
  readonly describer: ReturnType<typeof createDescriber>;
  readonly shownAsNode: ArrowTextContext['shownAsNode'];
}

/** The card's outcomes (each with its stored outcome, in the record's order) as groups. */
export function outcomeGroupsOf(
  reaction: Reaction,
  entries: readonly { readonly card: OutcomeDraft; readonly stored: Outcome | undefined }[],
  context: GroupsContext,
): readonly FamilyOutcomeGroup[] {
  const storedOf = new Map(entries.map((entry) => [entry.card.outcomeId as string, entry.stored]));
  const holding = new Map(groupOutcomes(reaction.outcomes).map((group) => [group.key, group.outcomes] as const));
  const groups = groupOutcomes(entries.map((entry) => entry.card)).map((group) => {
    const several = group.outcomes.length > 1;
    const outcomes: FamilyCardOutcome[] = group.outcomes.map((outcome) => ({
      ...outcome,
      word: several ? outcomeWordOf(outcome.selectivity, outcome.regiochemistry) : selectivityWordOf(outcome.selectivity),
    }));
    const arrowText = arrowTextOf(reaction, {
      schemes: context.schemes,
      conditionVariantIds: group.conditionVariantIds as readonly ConditionVariantId[],
      carriedParticipantId: context.participantId,
      describe: context.describer.describeForArrow,
      shownAsNode: context.shownAsNode,
    });
    const storedOutcomes = group.outcomes.map((outcome) => storedOf.get(outcome.outcomeId)).filter((stored): stored is Outcome => stored !== undefined);
    // the equation holds the WHOLE condition group of the reaction (7.2b A5): every outcome with the same variant set, wherever its products land
    const wholeGroup = holding.get(group.key) ?? storedOutcomes;
    const equation =
      wholeGroup.length === 0
        ? undefined
        : fullEquationOfGroup(reaction, wholeGroup, { schemes: context.schemes, describe: context.describer.describeForArrow, substanceOf: context.describer.substanceOf, shownAsNode: context.shownAsNode });
    const labels = group.conditionVariantIds.flatMap((id) => reaction.conditionVariants.find((variant) => variant.id === id)?.label ?? []);
    return {
      key: group.key,
      conditionVariantIds: group.conditionVariantIds,
      heading: headingOf(arrowText, labels),
      labels,
      conditionWords: conditionWordsOf(arrowText),
      outcomes,
      arrowText,
      ...(equation === undefined ? {} : { equation }),
    };
  });
  // two groups that would get the same heading start with their variant label ("Limited NH3: 373 K, sealed tube")
  const counts = new Map<string, number>();
  for (const group of groups) counts.set(group.heading, (counts.get(group.heading) ?? 0) + 1);
  return groups.map(({ labels, conditionWords, ...group }) => {
    if ((counts.get(group.heading) ?? 0) < 2 || labels.length === 0) return group;
    return { ...group, heading: `${labels.join(' / ')}: ${conditionWords === '' ? group.heading : conditionWords}` };
  });
}
