/**
 * Test kit for the layout step (4.4): sorted `LayoutRequest`s from small descriptions, a seeded random graph generator, the
 * checks every layout must pass (every node and edge answered, finite numbers, no two node boxes overlapping, bounds containing
 * the boxes), and a mapper from a real `Projection` to a request with FIXED node sizes (the real Scene mapping is Phase 5).
 * Test code only; deterministic (its own seeded generator, no `Math.random`).
 */
import type { LayoutAlgorithm, LayoutDirection, LayoutEdgeInput, LayoutNodeInput, LayoutRequest, LayoutResult } from '@/layout/contracts';
import type { Projection } from '@/core/graph';

export const SPACING = { node: 20, layer: 60, edge: 10 } as const;
export const NODE_SIZE = { width: 120, height: 40 } as const;

const byId = (a: { readonly id: string }, b: { readonly id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export interface RequestSpec {
  readonly nodes: readonly (string | (Partial<LayoutNodeInput> & { readonly id: string }))[];
  /** `[from, to]` pairs (ids `e0`, `e1`, ... in the order given, zero-padded so they sort) or full edges. */
  readonly edges?: readonly (readonly [string, string] | LayoutEdgeInput)[];
  readonly algorithm?: LayoutAlgorithm;
  readonly direction?: LayoutDirection;
  readonly seed?: number;
  readonly previous?: LayoutRequest['previous'];
  readonly requestId?: string;
}

/** A valid request (sorted, unique) from a short description. */
export function request(spec: RequestSpec): LayoutRequest {
  const nodes: LayoutNodeInput[] = spec.nodes
    .map((node) => (typeof node === 'string' ? { id: node, ...NODE_SIZE } : { ...NODE_SIZE, ...node }))
    .sort(byId);
  const edges: LayoutEdgeInput[] = (spec.edges ?? [])
    .map((edge, i) => (Array.isArray(edge) ? { id: `e${String(i).padStart(5, '0')}`, from: edge[0] as string, to: edge[1] as string } : (edge as LayoutEdgeInput)))
    .sort(byId);
  return {
    requestId: spec.requestId ?? 'req',
    algorithm: spec.algorithm ?? 'layered',
    direction: spec.direction ?? 'RIGHT',
    nodes,
    edges,
    spacing: { ...SPACING },
    ...(spec.previous === undefined ? {} : { previous: spec.previous }),
    seed: spec.seed ?? 1,
  };
}

/** mulberry32: a small seeded generator (test data only). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RandomGraphOptions {
  readonly nodes: number;
  readonly edges: number;
  readonly seed?: number;
  readonly selfLoops?: number;
  /** Extra edges that repeat an existing (from, to) pair under a new id. */
  readonly parallel?: number;
  readonly algorithm?: LayoutAlgorithm;
  readonly direction?: LayoutDirection;
  /** Edges only go from a lower to a higher index (a DAG); default: any direction, so cycles appear. */
  readonly acyclic?: boolean;
}

/** A random graph with `nodes` nodes of varying sizes and `edges` edges in all (loops and parallel edges included in the count). */
export function randomRequest(options: RandomGraphOptions): LayoutRequest {
  const random = rng(options.seed ?? 1);
  const pad = (i: number): string => String(i).padStart(5, '0');
  const nodes = Array.from({ length: options.nodes }, (_, i) => ({ id: `n${pad(i)}`, width: 60 + Math.floor(random() * 100), height: 24 + Math.floor(random() * 40) }));
  const pairs: [string, string][] = [];
  // one node has no other node to join: every edge is a loop
  const loops = options.nodes < 2 ? options.edges : Math.min(options.selfLoops ?? 0, options.edges);
  const parallel = Math.min(options.parallel ?? 0, Math.max(0, options.edges - loops));
  for (let i = 0; i < loops; i += 1) {
    const id = `n${pad(Math.floor(random() * options.nodes))}`;
    pairs.push([id, id]);
  }
  while (pairs.length < options.edges - parallel) {
    let a = Math.floor(random() * options.nodes);
    let b = Math.floor(random() * options.nodes);
    if (a === b) continue;
    if (options.acyclic === true && a > b) [a, b] = [b, a];
    pairs.push([`n${pad(a)}`, `n${pad(b)}`]);
  }
  for (let i = 0; i < parallel && pairs.length > 0; i += 1) pairs.push(pairs[Math.floor(random() * pairs.length)] as [string, string]);
  return request({ nodes, edges: pairs, ...(options.algorithm === undefined ? {} : { algorithm: options.algorithm }), ...(options.direction === undefined ? {} : { direction: options.direction }) });
}

interface Rect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Ids of node pairs whose boxes overlap (touching edges are not overlap). Sweep over x, so it is fast at the caps. */
export function overlappingNodes(req: LayoutRequest, result: LayoutResult): string[] {
  const boxes: Rect[] = req.nodes.map((node) => ({ id: node.id, ...(result.positions[node.id] as { x: number; y: number }), width: node.width, height: node.height }));
  boxes.sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
  const bad: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) {
    const a = boxes[i] as Rect;
    for (let j = i + 1; j < boxes.length; j += 1) {
      const b = boxes[j] as Rect;
      if (b.x >= a.x + a.width) break;
      if (b.y < a.y + a.height && a.y < b.y + b.height) bad.push(`${a.id} / ${b.id}`);
    }
  }
  return bad;
}

const finitePoint = (p: { x: number; y: number } | undefined): boolean => p !== undefined && Number.isFinite(p.x) && Number.isFinite(p.y);

/** Everything every layout must satisfy; returns the problems (empty when valid). */
export function layoutProblems(req: LayoutRequest, result: LayoutResult): string[] {
  const problems: string[] = [];
  if (result.requestId !== req.requestId) problems.push('requestId differs');
  if ((result.engine === 'fallback') !== (result.fallbackReason !== undefined)) problems.push('fallbackReason is set exactly when the engine is the fallback');
  if (Object.keys(result.positions).length !== req.nodes.length) problems.push('a node has no position, or one too many');
  for (const node of req.nodes) if (!finitePoint(result.positions[node.id])) problems.push(`node ${node.id}: bad position`);
  if (Object.keys(result.edgeRoutes).length !== req.edges.length) problems.push('an edge has no route, or one too many');
  for (const edge of req.edges) {
    const route = result.edgeRoutes[edge.id];
    if (route === undefined || route.length < 2 || !route.every(finitePoint)) problems.push(`edge ${edge.id}: bad route`);
  }
  if (problems.length === 0) {
    problems.push(...overlappingNodes(req, result).map((pair) => `boxes overlap: ${pair}`));
    for (const node of req.nodes) {
      const p = result.positions[node.id] as { x: number; y: number };
      if (p.x + node.width > result.bounds.width + 1e-6 || p.y + node.height > result.bounds.height + 1e-6) problems.push(`node ${node.id} lies outside the bounds`);
    }
  }
  return problems;
}

/** A result without what may differ between runs: `durationMs`. Used for byte-identical comparisons. */
export const withoutTiming = (result: LayoutResult): Omit<LayoutResult, 'durationMs'> => {
  const { durationMs: _timing, ...rest } = result;
  void _timing;
  return rest;
};

/**
 * The edges a layout request carries for a projection. Raw: every edge. Bundled (GRAPH_SEMANTICS bundling, the Phase 5 rule):
 * one edge per bundle (id and endpoints of the bundle), plus every edge that is in no bundle; never the raw parallel edges.
 */
export function projectionLayoutEdges(projection: Projection, mode: 'raw' | 'bundled'): LayoutEdgeInput[] {
  if (mode === 'raw') return projection.edges.map((edge) => ({ id: edge.id, from: edge.from, to: edge.to }));
  const bundled = new Set(projection.bundles.flatMap((bundle) => bundle.edgeIds));
  return [
    ...projection.bundles.map((bundle) => ({ id: bundle.id, from: bundle.from, to: bundle.to })),
    ...projection.edges.filter((edge) => !bundled.has(edge.id)).map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
  ];
}

/** The request for a real projection: its nodes and edges (`raw`, or `bundled`) with FIXED sizes, sorted by `<` (the Scene mapping is Phase 5). */
export function projectionRequest(
  projection: Projection,
  over: Partial<Pick<RequestSpec, 'algorithm' | 'direction' | 'seed'>> & { readonly edges?: 'raw' | 'bundled' } = {},
): LayoutRequest {
  const { edges: mode = 'raw', ...rest } = over;
  return request({
    nodes: projection.nodes.map((node) => node.id),
    edges: projectionLayoutEdges(projection, mode),
    requestId: projection.key,
    ...rest,
  });
}
