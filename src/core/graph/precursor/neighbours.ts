/**
 * Backward-only neighbours for the precursor view (docs/GRAPH_SEMANTICS.md §5, §7): "what makes this".
 * A substance never looks forward (what consumes it), only backward (what produces it), degree-capped
 * (§11). A reaction, once reached from either side, reveals its full consumes AND produces edges — the
 * whole reaction in context (ADV-003, ADV-006, ADV-048) — but its sibling substances are only searched
 * further backward if the traversal reaches them (which it always does here, since every substance always
 * tries its own producers; bounded by TraversalLimits as everywhere else).
 */
import type { ConditionVariantId } from '../../schema';
import type { GraphEdge, ProjectionContext } from '../contracts';
import type { Step, TraversalDirection } from '../traversal';
import { fromReaction, fromSubstance, SUBSTANCE_KINDS } from '../reaction-explorer/neighbours';
import { capDegree } from './degree-cap';

const reversedLayout = (step: Step): Step => ({ ...step, data: { ...(step.data as GraphEdge), layoutDirection: 'reversed' } });

export interface BackwardNeighbours {
  readonly neighbours: (nodeId: string, direction: TraversalDirection) => readonly Step[];
  /** Overflow node ID → how many real neighbours it collapses (read into that node's `hidden` count). */
  readonly overflowCounts: Map<string, number>;
}

const VIEW = 'precursor_explorer' as const;

export function backwardNeighboursOf(ctx: ProjectionContext, selected: ConditionVariantId | undefined): BackwardNeighbours {
  const overflowCounts = new Map<string, number>();
  const neighbours = (nodeId: string, direction: TraversalDirection): readonly Step[] => {
    const record = ctx.indexes.get(nodeId);
    if (record === undefined) return [];
    if (record.kind === 'reaction') return fromReaction(ctx, record, direction, selected, VIEW).map(reversedLayout);
    if (!SUBSTANCE_KINDS.has(record.kind) || direction === 'out') return [];
    const steps = fromSubstance(ctx, { kind: record.kind, id: record.id }, 'in', selected, VIEW).map(reversedLayout);
    return capDegree(ctx, nodeId, 'in', steps, overflowCounts);
  };
  return { neighbours, overflowCounts };
}
