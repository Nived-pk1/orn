/**
 * `LayoutRequest` to an ELK graph (step 4.4), per algorithm, and the notes for whatever ELK cannot honour. What is honoured, as
 * measured on elkjs 0.12.0 (tests/integration/layout-elk.test.ts proves the first three on a real ELK):
 *
 *   hint          layered                                        radial                          stress
 *   layerHint     honoured as the ORDER of layers (ELK          only picks the root of each     ignored (noted)
 *                 partitions: a lower hint is never to the      tree (noted)
 *                 right of a higher one), not as exact layers
 *   orderHint     honoured as a PREFERENCE (model order: input  ignored (noted)                 ignored (noted)
 *                 order breaks ties of crossing minimisation);
 *                 not used when `previous` is
 *   previous      honoured as the order within layers (ELK's    ignored (noted)                 ignored (noted)
 *                 interactive crossing minimisation, positions
 *                 as hints); a node without one takes the mean
 *                 of its positioned neighbours, else the end
 *   pinned        ignored (noted): ELK layered has no fixed     ignored (noted)                 ignored (noted): its `fixed`
 *                 positions                                                                     option did not hold on 0.12.0
 *   priority      honoured (layered.priority.direction)         ignored (noted)                 ignored (noted)
 *
 * `direction` applies to layered only. Spacing: node gap, layer gap (layered: between layers; radial: ring radius; stress:
 * desired edge length, both with the largest node dimension added: ELK measures them between centres) and edge gap. Radial and
 * stress ignore node sizes, so `map-result` spreads overlapping results (`spread.ts`).
 */
import type { LayoutAlgorithm, LayoutRequest } from '../contracts';
import { radialPlan, type RadialPlan } from './radial-tree';
import type { ElkChild, ElkEdge, ElkGraph } from './types';

/** The gap ELK keeps between an edge label and the edge and nodes around it (step 5.5a, item a). */
export const EDGE_LABEL_SPACING = 4;
/** ELK ignores a label whose text is empty (measured on 0.12.0: it gets no room and no position); the text itself is never drawn from it. */
const LABEL_TEXT = '#';
export const labelIdOf = (edgeId: string): string => `${edgeId}#label`;

export interface ElkInput {
  readonly graph: ElkGraph;
  readonly notes: string[];
  /** Radial only: the virtual node and what was left out of ELK's input. */
  readonly virtualIds: ReadonlySet<string>;
  readonly plan: RadialPlan | undefined;
}

/** A request ELK can lay out: every algorithm but `grid` (that one is the grid layout's, not ELK's). */
export type ElkRequest = Omit<LayoutRequest, 'algorithm'> & { readonly algorithm: Exclude<LayoutAlgorithm, 'grid'> };

const ALGORITHM = { layered: 'layered', radial: 'org.eclipse.elk.radial', stress: 'org.eclipse.elk.stress' } as const;
const NO_PADDING = '[top=0,left=0,bottom=0,right=0]';

/**
 * Radial rings and stress edges are measured between node CENTRES and ELK ignores node sizes there, so the layer spacing is added
 * to the largest node dimension: the gap between two neighbouring boxes is then at least the layer spacing.
 */
function ringLength(request: LayoutRequest): number {
  return request.spacing.layer + request.nodes.reduce((widest, node) => Math.max(widest, node.width, node.height), 0);
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  let id = base;
  while (taken.has(id)) id = `#${id}`;
  return id;
}

/** A position for every node that has none, from its positioned neighbours (mean) or, failing that, the far end. */
function previousPositions(request: LayoutRequest): Map<string, { x: number; y: number }> {
  const known = new Map<string, { x: number; y: number }>();
  for (const node of request.nodes) {
    const p = request.previous?.[node.id];
    if (p !== undefined) known.set(node.id, { x: p.x, y: p.y });
  }
  if (known.size === 0) return known;
  const end = { x: Math.max(...[...known.values()].map((p) => p.x)), y: Math.max(...[...known.values()].map((p) => p.y)) };
  const neighbours = new Map<string, string[]>();
  for (const edge of request.edges) {
    (neighbours.get(edge.from) ?? neighbours.set(edge.from, []).get(edge.from))?.push(edge.to);
    (neighbours.get(edge.to) ?? neighbours.set(edge.to, []).get(edge.to))?.push(edge.from);
  }
  const filled = new Map(known);
  for (const node of request.nodes) {
    if (known.has(node.id)) continue;
    const near = (neighbours.get(node.id) ?? []).flatMap((id) => (known.has(id) ? [known.get(id) as { x: number; y: number }] : []));
    filled.set(node.id, near.length === 0 ? end : { x: near.reduce((s, p) => s + p.x, 0) / near.length, y: near.reduce((s, p) => s + p.y, 0) / near.length });
  }
  return filled;
}

function notesFor(request: ElkRequest, usesPrevious: boolean): string[] {
  const { algorithm } = request;
  const notes: string[] = [];
  const count = (test: (node: LayoutRequest['nodes'][number]) => boolean): number => request.nodes.filter(test).length;
  const pinned = count((node) => node.pinned !== undefined);
  if (pinned > 0) notes.push(`pinned positions of ${pinned} node(s) are ignored: ELK ${algorithm} cannot fix positions`);
  const layerHints = count((node) => node.layerHint !== undefined);
  if (layerHints > 0 && algorithm === 'radial') notes.push(`layerHint of ${layerHints} node(s) only chooses the root of each tree in a radial layout`);
  if (layerHints > 0 && algorithm === 'stress') notes.push(`layerHint of ${layerHints} node(s) is ignored by the stress layout`);
  const orderHints = count((node) => node.orderHint !== undefined);
  if (orderHints > 0 && algorithm !== 'layered') notes.push(`orderHint of ${orderHints} node(s) is ignored by the ${algorithm} layout`);
  if (orderHints > 0 && algorithm === 'layered' && usesPrevious) notes.push(`orderHint of ${orderHints} node(s) is ignored: previous positions decide the order`);
  if (request.previous !== undefined && Object.keys(request.previous).length > 0) {
    if (algorithm !== 'layered') notes.push(`previous positions are ignored by the ${algorithm} layout`);
    else if (!usesPrevious) notes.push('previous positions name no node of the request, so they were not used');
  }
  const labelled = request.edges.filter((edge) => edge.label !== undefined).length;
  if (labelled > 0 && algorithm !== 'layered') notes.push(`edge labels of ${labelled} edge(s) are ignored by the ${algorithm} layout`);
  if (algorithm !== 'layered' && request.edges.some((edge) => edge.priority !== undefined)) notes.push(`edge priority is ignored by the ${algorithm} layout`);
  return notes;
}

/**
 * ELK's `randomSeed` is a Java int and ELK treats 0 as "seed from the clock" (measured on 0.12.0: stress with seed 0 gave a new
 * layout on every call). The request's unsigned 32-bit seed is mapped into 1..2^31-1: seeds 0..2^31-3 map one to one (shifted by
 * one); larger seeds wrap, so two of them can share a layout.
 */
export const elkSeed = (seed: number): number => 1 + (seed % 2_147_483_646);

export function mapRequest(asked: LayoutRequest): ElkInput {
  // the engine lays a stray `grid` request out layered (and says so); here it is only the type that is narrowed
  const request = (asked.algorithm === 'grid' ? { ...asked, algorithm: 'layered' } : asked) as ElkRequest;
  const { algorithm, spacing } = request;
  const options: Record<string, string> = {
    'elk.algorithm': ALGORITHM[algorithm],
    'elk.randomSeed': String(elkSeed(request.seed)),
    'elk.padding': NO_PADDING,
    'elk.spacing.nodeNode': String(spacing.node),
    'elk.spacing.edgeEdge': String(spacing.edge),
    'elk.spacing.edgeNode': String(spacing.edge),
  };
  const children: ElkChild[] = request.nodes.map((node) => ({ id: node.id, width: node.width, height: node.height }));
  let edges: ElkEdge[] = request.edges.map((edge) => ({ id: edge.id, sources: [edge.from], targets: [edge.to] }));
  const virtualIds = new Set<string>();
  let plan: RadialPlan | undefined;
  let usesPrevious = false;
  const notes: string[] = [];

  if (algorithm === 'layered') {
    options['elk.direction'] = request.direction;
    options['elk.edgeRouting'] = 'ORTHOGONAL';
    options['elk.layered.thoroughness'] = '3';
    if (request.edges.some((edge) => edge.label !== undefined)) {
      options['elk.layered.edgeLabels.centerLabelPlacementStrategy'] = 'MEDIAN_LAYER';
      options['elk.spacing.edgeLabel'] = String(EDGE_LABEL_SPACING);
    }
    options['elk.layered.spacing.nodeNodeBetweenLayers'] = String(spacing.layer);
    options['elk.layered.spacing.edgeNodeBetweenLayers'] = String(spacing.edge);
    options['elk.layered.spacing.edgeEdgeBetweenLayers'] = String(spacing.edge);
    if (request.nodes.some((node) => node.layerHint !== undefined)) {
      options['elk.partitioning.activate'] = 'true';
      request.nodes.forEach((node, i) => {
        if (node.layerHint !== undefined) (children[i] as ElkChild).layoutOptions = { 'elk.partitioning.partition': String(node.layerHint) };
      });
    }
    const previous = previousPositions(request);
    usesPrevious = previous.size > 0;
    if (usesPrevious) {
      options['elk.layered.crossingMinimization.strategy'] = 'INTERACTIVE';
      for (const child of children) {
        const p = previous.get(child.id) as { x: number; y: number };
        child.x = p.x;
        child.y = p.y;
      }
    } else if (request.nodes.some((node) => node.orderHint !== undefined)) {
      options['elk.layered.considerModelOrder.strategy'] = 'PREFER_NODES';
      const hint = new Map(request.nodes.map((node) => [node.id, node.orderHint ?? Number.POSITIVE_INFINITY] as const));
      children.sort((a, b) => (hint.get(a.id) as number) - (hint.get(b.id) as number) || (a.id < b.id ? -1 : 1));
    }
    request.edges.forEach((edge, i) => {
      if (edge.label !== undefined) {
        (edges[i] as ElkEdge).labels = [
          { id: labelIdOf(edge.id), text: LABEL_TEXT, width: edge.label.width, height: edge.label.height, layoutOptions: { 'elk.edgeLabels.placement': 'CENTER', 'elk.edgeLabels.inline': 'false' } },
        ];
      }
      if (edge.priority !== undefined) (edges[i] as ElkEdge).layoutOptions = { 'elk.layered.priority.direction': String(edge.priority) };
    });
  } else if (algorithm === 'radial') {
    options['elk.radial.radius'] = String(ringLength(request));
    plan = radialPlan(request);
    const taken = new Set([...request.nodes.map((n) => n.id), ...request.edges.map((e) => e.id)]);
    edges = plan.tree.map((t) => ({ id: t.edgeId, sources: [t.parent], targets: [t.child] }));
    if (plan.roots.length > 1) {
      const centre = uniqueId('virtual-centre', taken);
      taken.add(centre);
      virtualIds.add(centre);
      children.push({ id: centre, width: 0, height: 0 });
      for (const root of plan.roots) {
        const id = uniqueId(`virtual-${root}`, taken);
        taken.add(id);
        virtualIds.add(id);
        edges.push({ id, sources: [centre], targets: [root] });
      }
      notes.push(`${plan.roots.length} components were joined under a virtual centre node for the radial layout`);
    }
    if (plan.nonTreeEdgeIds.length > 0) notes.push(`${plan.nonTreeEdgeIds.length} edge(s) outside the spanning tree are drawn straight (a radial layout needs a tree)`);
  } else {
    options['elk.stress.desiredEdgeLength'] = String(ringLength(request));
  }
  notes.push(...notesFor(request, usesPrevious));
  return { graph: { id: 'root', layoutOptions: options, children, edges }, notes, virtualIds, plan };
}
