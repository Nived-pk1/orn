/**
 * Edge styling (docs/GRAPH_SEMANTICS.md §4; step 5.3). Selectivity of a produces edge: exclusive and major solid heavy, minor
 * dashed, trace dotted light, mixture_component and unspecified solid normal. An inferred edge (class membership, never
 * stated) is dotted whatever its selectivity, except a hub-to-hub arrow (see `styleOf`). A bundle is dotted only when EVERY drawn edge of it is inferred and takes the
 * weight (and, if not dotted, the stroke) of its best-ranked edge. Membership and overflow edges have their own light style.
 * Tables, no branching on names or IDs.
 */
import type { EdgeSemantic, GraphEdge } from '@/core/graph/contracts';
import type { SceneEdge } from './contracts';

type Selectivity = NonNullable<GraphEdge['selectivity']>;
type Stroke = SceneEdge['stroke'];
type Weight = SceneEdge['weight'];

/** Best first: the rank order the navigator draws arrows in (step 5.4c). */
const RANK: Readonly<Record<Selectivity, number>> = { exclusive: 0, major: 1, mixture_component: 2, unspecified: 3, minor: 4, trace: 5 };
const UNKNOWN_RANK = RANK.unspecified;

const STROKE_OF: Readonly<Record<Selectivity, Stroke>> = { exclusive: 'solid', major: 'solid', mixture_component: 'solid', unspecified: 'solid', minor: 'dashed', trace: 'dotted' };
const WEIGHT_OF: Readonly<Record<Selectivity, Weight>> = { exclusive: 'heavy', major: 'heavy', mixture_component: 'normal', unspecified: 'normal', minor: 'normal', trace: 'light' };

/** An edge without a stated selectivity (a relationship, a membership) is drawn like `unspecified`. */
const selectivityOf = (edge: GraphEdge): Selectivity => edge.selectivity ?? 'unspecified';

const ARROW_HEAD: Readonly<Record<EdgeSemantic, SceneEdge['arrowHead']>> = {
  consumes: 'filled',
  produces: 'filled',
  transforms_to: 'filled',
  uses_reagent: 'open',
  uses_mechanism: 'open',
  instance_of: 'open',
  membership: 'none',
  relationship: 'open',
  prerequisite: 'open',
  overflow: 'none',
};

export interface EdgeStyle {
  readonly stroke: Stroke;
  readonly weight: Weight;
  readonly arrowHead: SceneEdge['arrowHead'];
  /** The edge whose semantic and arrowhead the path takes: the best-ranked one. */
  readonly semantic: EdgeSemantic;
  /** True for an inferred hub-to-hub arrow: not dotted (every roll-up is inferred), but its name says so. */
  readonly viaMembership: boolean;
}

/** The best-ranked edge of a non-empty list: lowest rank, then lowest ID. */
export function bestEdge(edges: readonly GraphEdge[]): GraphEdge {
  let best = edges[0] as GraphEdge;
  for (const edge of edges) {
    const a = RANK[selectivityOf(edge)] ?? UNKNOWN_RANK;
    const b = RANK[selectivityOf(best)] ?? UNKNOWN_RANK;
    if (a < b || (a === b && edge.id < best.id)) best = edge;
  }
  return best;
}

/** The style of one path from the edges it draws (a single edge, or a bundle's materialised edges). */
/**
 * `hubToHub`: both ends are hub nodes. Then every arrow is a roll-up and `inferred` says nothing, so the stroke follows the
 * selectivity only (GRAPH_SEMANTICS §3 and §4, dated 2026-10-08); the name says "through class membership" instead.
 */
export function styleOf(edges: readonly GraphEdge[], hubToHub = false): EdgeStyle {
  const best = bestEdge(edges);
  if (best.semantic === 'membership') return { stroke: 'solid', weight: 'light', arrowHead: 'none', semantic: 'membership', viaMembership: false };
  if (best.semantic === 'overflow') return { stroke: 'dashed', weight: 'light', arrowHead: 'none', semantic: 'overflow', viaMembership: false };
  const selectivity = selectivityOf(best);
  const allInferred = edges.every((edge) => edge.inferred);
  const dotted = allInferred && !hubToHub;
  return { stroke: dotted ? 'dotted' : STROKE_OF[selectivity], weight: WEIGHT_OF[selectivity], arrowHead: ARROW_HEAD[best.semantic], semantic: best.semantic, viaMembership: hubToHub && allInferred };
}
