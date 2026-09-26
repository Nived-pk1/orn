/** Reaction structure helpers shared by the RXN rules and the route rules. */
import type { Outcome, Reaction, RecordRef, SubstanceRef } from '../../schema';

export const substanceKey = (ref: { readonly kind: string; readonly id: string }): string => `${ref.kind}:${ref.id}`;

/** An empty variant list means "all variants", so it overlaps everything. */
export function variantsOverlap(a: readonly string[], b: readonly string[]): boolean {
  return a.length === 0 || b.length === 0 || a.some((id) => b.includes(id));
}

export const outcomeName = (outcome: Outcome, index: number): string =>
  outcome.label === undefined ? `Outcome ${index + 1}` : `Outcome ${index + 1} ("${outcome.label}")`;

/** The stage kinds each participant appears in (participants in no stage map to an empty list). */
export function stagesOfParticipants(reaction: Reaction): ReadonlyMap<string, readonly Reaction['stages'][number][]> {
  const byParticipant = new Map<string, Reaction['stages'][number][]>();
  for (const participant of reaction.participants) byParticipant.set(participant.id, []);
  for (const stage of reaction.stages) {
    for (const id of new Set(stage.participantIds)) byParticipant.get(id)?.push(stage);
  }
  return byParticipant;
}

/** Products of the outcome a route step names, or of every outcome when it names none. */
export function productsOf(reaction: Reaction, outcomeId: string | undefined): RecordRef[] {
  const outcomes = outcomeId === undefined ? reaction.outcomes : reaction.outcomes.filter((o) => o.id === outcomeId);
  return outcomes.flatMap((outcome) => outcome.products.map((p) => ({ kind: p.ref.kind, id: p.ref.id })));
}

export const reactants = (reaction: Reaction): SubstanceRef[] =>
  reaction.participants.filter((p) => p.role === 'reactant').map((p) => p.ref);
