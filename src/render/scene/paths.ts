/**
 * The drawn paths of a projection (step 5.3), shared by the layout request and the scene so both agree on what a path is:
 * a bundle (one path for every edge of its pair; the path's id is the bundle id), or a single edge that no bundle holds (its own
 * id). A path whose ends are the same node is a self-loop (decision Q4): the layout never sees it and the scene draws it beside
 * its node. Pure; nothing is dropped: every edge of the projection is in exactly one path or is named in a bundle's `edgeIds`.
 */
import type { EdgeBundle, GraphEdge, Projection } from '@/core/graph/contracts';

export interface DrawnPath {
  /** The bundle id, or the id of the single edge. Unique among paths. */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly loop: boolean;
  /** The edges this path draws (a bundle's materialised edges, or the one edge); never empty. */
  readonly edges: readonly GraphEdge[];
  /** Reactions the path stands for: a bundle's distinct reactions (its total when it has no count), 1 for a single edge. A path may draw more edges than that (one per outcome). */
  readonly total: number;
  readonly bundled: boolean;
  /** Of the reactions above, how many are examples folded under their general reaction and not counted in `total` (7.3a C3); absent: none. */
  readonly examples?: number;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function bundlePath(bundle: EdgeBundle, byId: ReadonlyMap<string, GraphEdge>): DrawnPath | undefined {
  const edges = bundle.edgeIds.flatMap((id) => byId.get(id) ?? []);
  if (edges.length === 0) return undefined;
  return { id: bundle.id, from: bundle.from, to: bundle.to, loop: bundle.from === bundle.to, edges, total: bundle.reactions ?? Math.max(bundle.total, edges.length), bundled: true, ...(bundle.examples === undefined ? {} : { examples: bundle.examples }) };
}

/** Every drawn path of `projection`, sorted by id. A bundle that names no edge of the projection is not a path (the projection harness refuses it). */
export function drawnPaths(projection: Projection): readonly DrawnPath[] {
  const byId = new Map<string, GraphEdge>();
  for (const edge of projection.edges) byId.set(edge.id, edge);
  const inBundle = new Set<string>();
  const paths: DrawnPath[] = [];
  for (const bundle of projection.bundles) {
    const path = bundlePath(bundle, byId);
    if (path === undefined) continue;
    for (const edge of path.edges) inBundle.add(edge.id);
    paths.push(path);
  }
  for (const edge of projection.edges) {
    if (inBundle.has(edge.id)) continue;
    paths.push({ id: edge.id, from: edge.from, to: edge.to, loop: edge.from === edge.to, edges: [edge], total: 1, bundled: false });
  }
  return paths.sort((a, b) => compare(a.id, b.id));
}
