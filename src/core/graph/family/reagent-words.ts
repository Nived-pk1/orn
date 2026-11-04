/**
 * The reagent words of one reaction as its card writes them over the arrow (step 8.2b, D): the names and formulas above the arrow, joined by
 * ", " ("PCC"). The same `arrowTextOf` the card uses, with the same kit; nothing is decided here. Empty when the arrow carries none.
 */
import type { ReadonlyIndexes } from '../../indexes/contracts';
import type { CanonicalState, ConditionVariantId, ParticipantId, Reaction } from '../../schema';
import { arrowTextOf } from '../arrow-text';
import { createCardKit, type CardKit } from './card';

export function reagentWordsOf(kit: CardKit, reaction: Reaction, carried: { readonly participantId: ParticipantId; readonly conditionVariantIds: readonly ConditionVariantId[] }): string {
  const text = arrowTextOf(reaction, {
    schemes: kit.schemesOf(reaction.id),
    conditionVariantIds: carried.conditionVariantIds,
    carriedParticipantId: carried.participantId,
    describe: kit.describer.describeForArrow,
    shownAsNode: kit.shownAsNode,
  });
  return text.above
    .filter((part) => part.kind === 'name' || part.kind === 'formula')
    .map((part) => part.text)
    .join(', ');
}

/** A reader of the reagent words of any reaction of this state (one kit, so the describer and the schemes are shared). */
export function createReagentWords(state: CanonicalState, indexes: ReadonlyIndexes): (reactionId: string, carried: { readonly participantId: ParticipantId; readonly conditionVariantIds: readonly ConditionVariantId[] }) => string {
  const kit = createCardKit({ state, indexes, scopeOf: () => 'unmapped' });
  return (reactionId, carried) => {
    const reaction = state.records.reaction[reactionId];
    return reaction === undefined ? '' : reagentWordsOf(kit, reaction, carried);
  };
}
