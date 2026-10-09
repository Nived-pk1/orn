/**
 * Nodes and edges of the navigator projection (step 5.4c): hub nodes, member nodes of expanded hubs, overflow
 * nodes, the edge of an arrow, and the structural membership and overflow edges. Pure constructors.
 */
import type { NavigatorCandidate } from '../../indexes/contracts';
import type { NavigatorAnchor, RecordRef } from '../../schema';
import type { GraphEdge, GraphNode, NodeArrangement, ProjectionContext } from '../contracts';
import { graphEdgeId } from '../ids';
import { flagsOf } from '../kit';
import { UNCLASSIFIED_HUB_ID } from './hubs';
import type { HubExpansion } from './expansion';

export const VIEW = 'navigator' as const;

const NODE_KIND: Readonly<Record<string, GraphNode['kind']>> = {
  species: 'species',
  class: 'class',
  reagent: 'reagent',
  concept: 'concept',
  named_reaction: 'named_reaction',
};

export const overflowNodeId = (hubId: string): string => `virtual:overflow:${hubId}`;

/** The edge of one arrow, drawn between `from` and `to` (hubs, or members of expanded hubs). */
export function toEdge(candidate: NavigatorCandidate, from: string, to: string): GraphEdge {
  const identity = {
    view: VIEW,
    from,
    to,
    semantic: 'transforms_to',
    reactionId: candidate.reactionId,
    outcomeId: candidate.outcomeId,
    productId: candidate.productId,
    participantId: candidate.participantId,
  } as const;
  return {
    id: graphEdgeId(identity),
    from,
    to,
    semantic: identity.semantic,
    reactionId: candidate.reactionId,
    outcomeId: candidate.outcomeId,
    productId: candidate.productId,
    participantId: candidate.participantId,
    selectivity: candidate.selectivity,
    conditionVariantIds: candidate.conditionVariantIds,
    inferred: candidate.inferred,
    layoutDirection: 'forward',
  };
}

/** A membership or overflow edge: structural, never one real participation or production (no `reactionId`, ADR-028). */
function structuralEdge(semantic: 'membership' | 'overflow', from: string, to: string, inferred: boolean): GraphEdge {
  return { id: graphEdgeId({ view: VIEW, from, to, semantic }), from, to, semantic, conditionVariantIds: [], inferred, layoutDirection: 'forward' };
}

type Hidden = { readonly outgoing: number; readonly incoming: number };
const NONE: Hidden = { outgoing: 0, incoming: 0 };

/**
 * The arrangement of each anchored record, by target ID: from the anchor with the lowest `order` (then the lowest ID) of that target.
 * A target whose anchor has none of cell, group and tone has no entry.
 */
export function arrangementsOf(ctx: ProjectionContext): ReadonlyMap<string, NodeArrangement> {
  const best = new Map<string, NavigatorAnchor>();
  for (const anchor of ctx.indexes.anchors()) {
    const held = best.get(anchor.target.id);
    if (held === undefined || anchor.order < held.order || (anchor.order === held.order && anchor.id < held.id)) best.set(anchor.target.id, anchor);
  }
  const found = new Map<string, NodeArrangement>();
  for (const [target, anchor] of best) {
    if (anchor.cell === undefined && anchor.group === undefined && anchor.tone === undefined) continue;
    found.set(target, {
      ...(anchor.cell === undefined ? {} : { cell: { column: anchor.cell.column, row: anchor.cell.row } }),
      ...(anchor.group === undefined ? {} : { group: anchor.group }),
      ...(anchor.tone === undefined ? {} : { tone: anchor.tone }),
    });
  }
  return found;
}

export function hubNode(ctx: ProjectionContext, ref: RecordRef, hidden: Hidden | undefined, arrangement?: NodeArrangement): GraphNode {
  return {
    id: ref.id,
    kind: NODE_KIND[ref.kind] ?? 'virtual',
    record: ref,
    role: 'anchor',
    depth: 0,
    hidden: hidden ?? NONE,
    flags: flagsOf(ctx, ref),
    ...(arrangement === undefined ? {} : { arrangement }),
  };
}

export function unclassifiedNode(hidden: Hidden | undefined): GraphNode {
  return { id: UNCLASSIFIED_HUB_ID, kind: 'virtual', role: 'unclassified', depth: 0, hidden: hidden ?? NONE, flags: ['unanchored'] };
}

/** Member nodes, overflow node and their structural edges for one expanded hub. */
export function expansionParts(
  ctx: ProjectionContext,
  expansion: HubExpansion,
  hiddenOf: (id: string) => Hidden | undefined,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  // Membership is inferred whenever the hub resolution is: a member reaches a real hub through class membership.
  const inferred = expansion.hubId !== UNCLASSIFIED_HUB_ID;
  for (const ref of expansion.members) {
    nodes.push({ id: ref.id, kind: NODE_KIND[ref.kind] ?? 'virtual', record: ref, role: 'member', depth: 1, hidden: hiddenOf(ref.id) ?? NONE, flags: flagsOf(ctx, ref) });
    edges.push(structuralEdge('membership', ref.id, expansion.hubId, inferred));
  }
  if (expansion.overflow !== null) {
    const id = overflowNodeId(expansion.hubId);
    const { members, outgoing, incoming } = expansion.overflow;
    nodes.push({ id, kind: 'virtual', role: 'overflow', depth: 1, hidden: { outgoing, incoming }, hiddenMembers: members, flags: [] });
    edges.push(structuralEdge('overflow', id, expansion.hubId, false));
  }
  return { nodes, edges };
}
