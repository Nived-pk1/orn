/**
 * What the reaction explorer draws for one reaction (docs/GRAPH_SEMANTICS.md §1, §7): the full bipartite
 * consumes/produces edges, minus spectators and anything `showAsNode: never` (arrow text instead — the
 * reaction record itself still carries them, so nothing is lost, ADV-027/053). Intermediates are never
 * read here: they are not participants or products (ADV-054).
 */
import type { ConditionVariantId, Outcome, Participant, Product, Reaction, ViewKey } from '../../schema';
import type { GraphEdge, ProjectionContext } from '../contracts';
import { graphEdgeId } from '../ids';
import { drawnAsNode } from '../kit';

/**
 * Condition variants (of `reaction`) that list `participantId`; empty = common to every variant. Exported
 * for `graph/route`, which weighs a participant's own variant restriction against an outcome's separately
 * (docs/GRAPH_SEMANTICS.md §9) rather than against one `selected` variant.
 */
export function variantsOfParticipant(reaction: Reaction, participantId: Participant['id']): ConditionVariantId[] {
  return reaction.conditionVariants.filter((v) => v.participantIds.includes(participantId)).map((v) => v.id);
}

/** A participant holds under `selected` when it is common (no variant lists it) or `selected` does. */
function participantHoldsUnder(reaction: Reaction, participant: Participant, selected: ConditionVariantId | undefined): boolean {
  if (selected === undefined) return true;
  const variants = variantsOfParticipant(reaction, participant.id);
  return variants.length === 0 || variants.includes(selected);
}

/** An outcome holds under `selected` per DOMAIN_MODEL.md §6.4: empty `conditionVariantIds` = all variants. */
function outcomeHoldsUnder(outcome: Outcome, selected: ConditionVariantId | undefined): boolean {
  return selected === undefined || outcome.conditionVariantIds.length === 0 || outcome.conditionVariantIds.includes(selected);
}

/** Participants drawn in the reaction explorer: not a spectator, not `showAsNode: never`, holds under the variant. */
export function qualifyingParticipants(ctx: ProjectionContext, reaction: Reaction, selected: ConditionVariantId | undefined): Participant[] {
  return reaction.participants.filter(
    (p) => p.role !== 'spectator' && drawnAsNode(ctx, p.ref) && participantHoldsUnder(reaction, p, selected),
  );
}

/** Outcome products drawn in the reaction explorer: every role (main/coproduct/byproduct), never intermediates. */
export function qualifyingProducts(ctx: ProjectionContext, reaction: Reaction, selected: ConditionVariantId | undefined): { readonly outcome: Outcome; readonly product: Product }[] {
  return reaction.outcomes
    .filter((o) => outcomeHoldsUnder(o, selected))
    .flatMap((outcome) => outcome.products.filter((p) => drawnAsNode(ctx, p.ref)).map((product) => ({ outcome, product })));
}

/**
 * Consumes edge: substance → reaction, one per participant (GRAPH_SEMANTICS.md §1). `view` is part of the
 * edge-ID identity (GRAPH_SEMANTICS.md §10) so the same participation gets a different ID per view; shared
 * by `reaction_explorer` and `precursor_explorer` (which also overrides `layoutDirection` after building).
 */
export function consumesEdge(reaction: Reaction, participant: Participant, view: ViewKey): GraphEdge {
  const identity = { view, from: participant.ref.id, to: reaction.id, semantic: 'consumes' as const, reactionId: reaction.id, participantId: participant.id };
  return {
    id: graphEdgeId(identity),
    from: identity.from,
    to: identity.to,
    semantic: identity.semantic,
    reactionId: reaction.id,
    participantId: participant.id,
    conditionVariantIds: variantsOfParticipant(reaction, participant.id),
    inferred: false,
    layoutDirection: 'forward',
  };
}

/** Produces edge: reaction → substance, one per outcome product (GRAPH_SEMANTICS.md §1). See `consumesEdge` on `view`. */
export function producesEdge(reaction: Reaction, outcome: Outcome, product: Product, view: ViewKey): GraphEdge {
  const identity = { view, from: reaction.id, to: product.ref.id, semantic: 'produces' as const, reactionId: reaction.id, outcomeId: outcome.id, productId: product.id };
  return {
    id: graphEdgeId(identity),
    from: identity.from,
    to: identity.to,
    semantic: identity.semantic,
    reactionId: reaction.id,
    outcomeId: outcome.id,
    productId: product.id,
    selectivity: outcome.selectivity,
    conditionVariantIds: outcome.conditionVariantIds,
    inferred: false,
    layoutDirection: 'forward',
  };
}
