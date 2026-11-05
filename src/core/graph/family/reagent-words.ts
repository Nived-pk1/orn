/**
 * The reagent words of one reaction as its card writes them over the arrow (step 8.2b, D): the names and formulas above the arrow, joined by
 * ", " ("PCC"). The same `arrowTextOf` the card uses, with the same kit; nothing is decided here. Empty when the arrow carries none.
 * Step 8.3, A3: the PARTS come with the text (a part is a name or a formula, as the card knows it), so a chip, a chain step and the arrow's
 * rows can set the formulas in subscripts exactly as the card does. The text is the written label (`originalText` wins), never a computed formula.
 */
import type { ReadonlyIndexes } from '../../indexes/contracts';
import type { CanonicalState, ConditionVariantId, ParticipantId, Reaction } from '../../schema';
import { arrowTextOf, type ArrowTextPart } from '../arrow-text';
import { createCardKit, type CardKit } from './card';

export interface ReagentWords {
  /** The parts above the arrow that are names or formulas, in the card's order. */
  readonly parts: readonly ArrowTextPart[];
  /** Their characters joined by ", " ('' when there are none). */
  readonly text: string;
}

type Carried = { readonly participantId: ParticipantId; readonly conditionVariantIds: readonly ConditionVariantId[] };

export function reagentWordsOf(kit: CardKit, reaction: Reaction, carried: Carried): ReagentWords {
  const text = arrowTextOf(reaction, {
    schemes: kit.schemesOf(reaction.id),
    conditionVariantIds: carried.conditionVariantIds,
    carriedParticipantId: carried.participantId,
    describe: kit.describer.describeForArrow,
    shownAsNode: kit.shownAsNode,
  });
  const parts = text.above.filter((part) => part.kind === 'name' || part.kind === 'formula');
  return { parts, text: parts.map((part) => part.text).join(', ') };
}

const NONE: ReagentWords = { parts: [], text: '' };

/** A reader of the reagent words of any reaction of this state (one kit, so the describer and the schemes are shared). */
export function createReagentWords(state: CanonicalState, indexes: ReadonlyIndexes): (reactionId: string, carried: Carried) => ReagentWords {
  const kit = createCardKit({ state, indexes, scopeOf: () => 'unmapped' });
  return (reactionId, carried) => {
    const reaction = state.records.reaction[reactionId];
    return reaction === undefined ? NONE : reagentWordsOf(kit, reaction, carried);
  };
}
