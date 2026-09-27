/**
 * Bipartite neighbours for the reaction explorer (docs/GRAPH_SEMANTICS.md §7): a substance's outgoing
 * edges are the reactions it participates in (consumes); its incoming edges are the reactions that
 * produce it (produces). A reaction's outgoing edges are its qualifying products; incoming are its
 * qualifying participants. Everything not a species/class/reagent/reaction is not part of this graph.
 */
import type { ConditionVariantId, Reaction, RecordRef } from '../../schema';
import type { ProjectionContext } from '../contracts';
import type { Step, TraversalDirection } from '../traversal';
import { consumesEdge, producesEdge, qualifyingParticipants, qualifyingProducts } from './select';

const SUBSTANCE_KINDS = new Set(['species', 'class', 'reagent']);

function fromReaction(ctx: ProjectionContext, reaction: Reaction, direction: TraversalDirection, selected: ConditionVariantId | undefined): Step[] {
  if (direction === 'out') {
    return qualifyingProducts(ctx, reaction, selected).map(({ outcome, product }) => {
      const edge = producesEdge(reaction, outcome, product);
      return { edgeId: edge.id, to: edge.to, data: edge };
    });
  }
  return qualifyingParticipants(ctx, reaction, selected).map((participant) => {
    const edge = consumesEdge(reaction, participant);
    return { edgeId: edge.id, to: edge.from, data: edge };
  });
}

function fromSubstance(ctx: ProjectionContext, ref: RecordRef, direction: TraversalDirection, selected: ConditionVariantId | undefined): Step[] {
  if (direction === 'out') {
    return ctx.indexes.participationsOf(ref).flatMap((p): Step[] => {
      const reaction = ctx.indexes.get(p.reactionId) as Reaction | undefined;
      const participant = reaction === undefined ? undefined : qualifyingParticipants(ctx, reaction, selected).find((x) => x.id === p.participantId);
      if (reaction === undefined || participant === undefined) return [];
      const edge = consumesEdge(reaction, participant);
      return [{ edgeId: edge.id, to: edge.to, data: edge }];
    });
  }
  return ctx.indexes.productionsOf(ref).flatMap((p): Step[] => {
    const reaction = ctx.indexes.get(p.reactionId) as Reaction | undefined;
    const match = reaction === undefined ? undefined : qualifyingProducts(ctx, reaction, selected).find((x) => x.product.id === p.productId && x.outcome.id === p.outcomeId);
    if (reaction === undefined || match === undefined) return [];
    const edge = producesEdge(reaction, match.outcome, match.product);
    return [{ edgeId: edge.id, to: edge.from, data: edge }];
  });
}

export function neighboursOf(ctx: ProjectionContext, selected: ConditionVariantId | undefined) {
  return (nodeId: string, direction: TraversalDirection): readonly Step[] => {
    const record = ctx.indexes.get(nodeId);
    if (record === undefined) return [];
    if (record.kind === 'reaction') return fromReaction(ctx, record, direction, selected);
    if (SUBSTANCE_KINDS.has(record.kind)) return fromSubstance(ctx, { kind: record.kind, id: record.id }, direction, selected);
    return [];
  };
}

/** Seeds usable by this view: existing records that are a substance or a reaction (missing ones are dropped, not phantom nodes). */
export function seedIdsOf(ctx: ProjectionContext, focus: readonly { readonly id: string }[]): string[] {
  return focus
    .map((ref) => ref.id)
    .filter((id) => {
      const record = ctx.indexes.get(id);
      return record !== undefined && (record.kind === 'reaction' || SUBSTANCE_KINDS.has(record.kind));
    });
}
