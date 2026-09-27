/**
 * ⇌ badge rule (docs/GRAPH_SEMANTICS.md §5, reviewer decision — no schema change): drawn only between the
 * produces edges of a `reverse_of` pair of reactions whose endpoints mirror each other — reaction R1
 * carries substrate X to main product Y, and R2 carries Y back to X. `reversibility.kind:
 * reversible_under_other_conditions` alone never triggers it (ADV-056); only a curated `reverse_of`
 * relationship between the two reactions, with mirrored substrate/product, does (ADV-004).
 *
 * Implemented by tagging the two mirrored produces edges with `relationshipId`/`relationshipType`
 * (already on `GraphEdge`, unused until now) rather than inventing a new edge or field.
 */
import { mainProducts, primarySubstrate } from '../navigator/select';
import type { Reaction, RelationshipId } from '../../schema';
import type { GraphEdge, ProjectionContext } from '../contracts';

function producesEdgesByReaction(edges: readonly GraphEdge[]): ReadonlyMap<string, GraphEdge[]> {
  const byReaction = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    if (edge.semantic !== 'produces' || edge.reactionId === undefined) continue;
    const list = byReaction.get(edge.reactionId);
    if (list === undefined) byReaction.set(edge.reactionId, [edge]);
    else list.push(edge);
  }
  return byReaction;
}

/** R1 and R2 mirror when R1's main product is R2's carried substrate, and vice versa. */
function mirroredSubstrates(ctx: ProjectionContext, r1: Reaction, r2: Reaction): { readonly ofR1: string; readonly ofR2: string } | undefined {
  const substrate1 = primarySubstrate(ctx, r1);
  const substrate2 = primarySubstrate(ctx, r2);
  if (substrate1 === undefined || substrate2 === undefined) return undefined;
  const r1MakesSubstrate2 = mainProducts(ctx, r1).some((p) => p.product.ref.id === substrate2.ref.id);
  const r2MakesSubstrate1 = mainProducts(ctx, r2).some((p) => p.product.ref.id === substrate1.ref.id);
  if (!r1MakesSubstrate2 || !r2MakesSubstrate1) return undefined;
  return { ofR1: substrate1.ref.id, ofR2: substrate2.ref.id };
}

/** Tags the produces edge of each reaction in a mirrored `reverse_of` pair, both admitted in this projection. */
export function tagReversiblePairs(ctx: ProjectionContext, edges: readonly GraphEdge[]): GraphEdge[] {
  const byReaction = producesEdgesByReaction(edges);
  if (byReaction.size === 0) return [...edges];
  const tag = new Map<string, { readonly relationshipId: RelationshipId; readonly relationshipType: 'reverse_of' }>();
  for (const reactionId of byReaction.keys()) {
    const reaction = ctx.indexes.get(reactionId);
    if (reaction?.kind !== 'reaction') continue;
    for (const relRef of ctx.indexes.relationshipsOf({ kind: 'reaction', id: reactionId })) {
      const relationship = ctx.indexes.get(relRef.id);
      if (relationship?.kind !== 'relationship' || relationship.type !== 'reverse_of') continue;
      if (relationship.from.kind !== 'reaction' || relationship.to.kind !== 'reaction') continue;
      const otherId = relationship.from.id === reactionId ? relationship.to.id : relationship.from.id;
      if (!byReaction.has(otherId)) continue;
      const other = ctx.indexes.get(otherId);
      if (other?.kind !== 'reaction') continue;
      const mirror = mirroredSubstrates(ctx, reaction, other);
      if (mirror === undefined) continue;
      for (const edge of byReaction.get(reactionId) ?? []) {
        if (edge.to === mirror.ofR2) tag.set(edge.id, { relationshipId: relationship.id, relationshipType: 'reverse_of' });
      }
    }
  }
  if (tag.size === 0) return [...edges];
  return edges.map((edge) => {
    const found = tag.get(edge.id);
    return found === undefined ? edge : { ...edge, relationshipId: found.relationshipId, relationshipType: found.relationshipType };
  });
}
