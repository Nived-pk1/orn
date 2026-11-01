/**
 * The reactions of a named reaction and what they reach (7.4 C): its own reactions and those of the family below it (`includeDescendants`),
 * the mechanisms those reactions point to (`mechanismIds` and the outcomes' mechanism links; a named reaction has no mechanism field of its own),
 * and the direct children. Derived from the indexes each time.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, NamedReactionId } from '../schema';

export function familyReactions(indexes: ReadonlyIndexes, id: string): readonly string[] {
  return indexes.reactionsByNamedReaction(id as NamedReactionId, { includeDescendants: true });
}

/** Mechanism ids reached through the reactions, distinct, in the order of the reactions given. */
export function mechanismsReached(state: CanonicalState, reactionIds: readonly string[]): string[] {
  const out = new Set<string>();
  for (const reactionId of reactionIds) {
    const reaction = state.records.reaction[reactionId as never];
    if (reaction === undefined) continue;
    for (const id of reaction.mechanismIds) out.add(id);
    for (const outcome of reaction.outcomes) if (outcome.mechanism !== undefined) out.add(outcome.mechanism.mechanismId);
  }
  return [...out].filter((id) => state.records.mechanism[id as never] !== undefined);
}

/** The direct children: descendants whose own `parentIds` name `id`. */
export function childIds(state: CanonicalState, indexes: ReadonlyIndexes, id: string): string[] {
  return indexes.descendantsOf('named_reaction', id).filter((child) => (state.records.named_reaction[child as NamedReactionId]?.parentIds as readonly string[] | undefined)?.includes(id) === true);
}
