/**
 * Which outcomes of which reactions link a mechanism, and which of its variants (step 6.5a, decisions D3 and D5): the editors refuse to remove a
 * variant, or to unlink a mechanism from its reaction, while an outcome still uses it. Derived from the canonical state each time it is asked;
 * nothing is stored. Pure; reactions in ID order, outcomes in their order.
 */
import type { CanonicalState } from '../schema';

export interface MechanismUse {
  readonly reactionId: string;
  readonly reactionName: string;
  /** 1-based position of the outcome in its reaction. */
  readonly outcomeNumber: number;
  readonly variantId: string | undefined;
}

export function outcomeUsesOfMechanism(state: CanonicalState, mechanismId: string): readonly MechanismUse[] {
  const uses: MechanismUse[] = [];
  for (const reaction of Object.values(state.records.reaction)) {
    for (const [index, outcome] of reaction.outcomes.entries()) {
      if (outcome.mechanism?.mechanismId !== mechanismId) continue;
      uses.push({ reactionId: reaction.id, reactionName: reaction.name, outcomeNumber: index + 1, variantId: outcome.mechanism.variantId });
    }
  }
  return uses.sort((a, b) => (a.reactionId < b.reactionId ? -1 : a.reactionId > b.reactionId ? 1 : a.outcomeNumber - b.outcomeNumber));
}

export const outcomeUsesOfVariant = (state: CanonicalState, mechanismId: string, variantId: string): readonly MechanismUse[] =>
  outcomeUsesOfMechanism(state, mechanismId).filter((use) => use.variantId === variantId);
