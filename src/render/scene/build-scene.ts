/**
 * buildScene (step 5.3): projection + layout result + sizes -> Scene, pure and deterministic. Every projection node is a scene
 * node and every drawn path (see `paths.ts`) is a scene edge, so nothing is dropped; the Scene copies the projection's
 * truncation and counts a bundle's TOTAL. No record is copied into it beyond what is drawn (names and formulas come through the
 * ports as text). A layout result that does not answer the projection (a stale result) is refused as a value, never patched.
 */
import type { GraphNode, NodeFlag, Projection } from '@/core/graph/contracts';
import type { LayoutResult, Point } from '@/layout/contracts';
import { countsByNode, edgeAria, nodeAria } from './aria';
import type { FormattedText, LodLevel, NodeSizes, Scene, SceneBadge, SceneEdge, SceneNode, ScenePorts } from './contracts';
import { styleOf } from './edge-style';
import { partsToRuns } from './formatted-text';
import type { LabelSize, LabelSizes } from './label-sizes';
import { loopGeometry, LOOP_RISE } from './loops';
import { contentOf, type NodeContent } from './node-content';
import { drawnPaths, type DrawnPath } from './paths';

export interface SceneOptions {
  /** The sizes the layout request was built from (`nodeSizes`); the layout result holds corners only. */
  readonly sizes: NodeSizes;
  /** The label sizes the layout request was built from (`labelSizes`); they widen the bounds. Without them a label has no extent. */
  readonly labelSizes?: LabelSizes;
}

export type SceneResult =
  | { readonly ok: true; readonly scene: Scene }
  | { readonly ok: false; readonly code: 'LAYOUT_MISMATCH' | 'MISSING_SIZE'; readonly missing: readonly string[]; readonly message: string };

const BADGE_OF: Readonly<Partial<Record<NodeFlag, SceneBadge['kind']>>> = {
  has_caveat: 'caveat',
  has_mechanism: 'mechanism',
  review_required: 'review',
  has_warning: 'warning',
  has_error: 'error',
  outside_scope: 'outside_scope',
};

function badgesOf(node: GraphNode): SceneBadge[] {
  const badges: SceneBadge[] = [];
  for (const flag of node.flags) {
    const kind = BADGE_OF[flag];
    if (kind !== undefined) badges.push({ kind });
  }
  const hidden = node.hidden.outgoing + node.hidden.incoming;
  if (hidden > 0) badges.push({ kind: 'hidden_neighbours', count: hidden });
  return badges;
}

const EMPHASIS: Readonly<Record<GraphNode['role'], SceneNode['emphasis']>> = { anchor: 'anchor', focus: 'target', member: 'normal', overflow: 'normal', unclassified: 'normal' };

/** Hubs and the Unclassified hub show as glyphs at the overview; every other node from the label level on. */
const minLodOf = (content: NodeContent): LodLevel => (content.box === 'hub' || content.box === 'unclassified' ? 0 : 1);

/** The point halfway along a polyline, by length; the first point for a zero-length one. */
export function midpoint(points: readonly Point[]): Point {
  const first = points[0] as Point;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += Math.hypot((points[i] as Point).x - (points[i - 1] as Point).x, (points[i] as Point).y - (points[i - 1] as Point).y);
  if (total === 0) return { x: first.x, y: first.y };
  let left = total / 2;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Point;
    const b = points[i] as Point;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length >= left && length > 0) return { x: a.x + ((b.x - a.x) * left) / length, y: a.y + ((b.y - a.y) * left) / length };
    left -= length;
  }
  const last = points[points.length - 1] as Point;
  return { x: last.x, y: last.y };
}

function arrowText(path: DrawnPath, ports: ScenePorts): { above?: FormattedText; below?: FormattedText } {
  const edge = path.edges[0] as DrawnPath['edges'][number];
  if (path.bundled || path.loop || edge.semantic === 'membership' || edge.semantic === 'overflow') return {};
  const text = ports.arrowTextOf(edge);
  const above = text === undefined ? [] : partsToRuns(text.above);
  const below = text === undefined ? [] : partsToRuns(text.below);
  return { ...(above.length === 0 ? {} : { above }), ...(below.length === 0 ? {} : { below }) };
}

/** The centre of the label box the layout placed (its top-left corner and the size asked for). */
function labelCentre(at: Point | undefined, size: LabelSize | undefined): Point | undefined {
  return at === undefined || size === undefined ? undefined : { x: at.x + size.width / 2, y: at.y + size.height / 2 };
}

/**
 * A loop reaches `LOOP_RISE` px above its node: when the layout puts a node with a loop closer than that to y = 0, everything the
 * layout drew moves down by the difference, so that every coordinate of the Scene stays at least 0 (the layout answer is not changed).
 */
function lifted(layout: LayoutResult, owners: readonly string[]): LayoutResult {
  let top = Infinity;
  for (const id of owners) top = Math.min(top, layout.positions[id]?.y ?? Infinity);
  const lift = top === Infinity ? 0 : Math.max(0, LOOP_RISE - top);
  if (lift === 0) return layout;
  const down = (p: Point): Point => ({ x: p.x, y: p.y + lift });
  const map = <T>(record: Readonly<Record<string, T>>, f: (value: T) => T): Record<string, T> => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, f(value)]));
  return {
    ...layout,
    positions: map(layout.positions, down),
    edgeRoutes: map(layout.edgeRoutes, (route) => route.map(down)),
    ...(layout.labelPositions === undefined ? {} : { labelPositions: map(layout.labelPositions, down) }),
    bounds: { width: layout.bounds.width, height: layout.bounds.height + lift },
  };
}

export function buildScene(projection: Projection, layoutResult: LayoutResult, options: SceneOptions, ports: ScenePorts): SceneResult {
  const paths = drawnPaths(projection);
  const layout = lifted(layoutResult, paths.filter((path) => path.loop).map((path) => path.from));
  const counts = countsByNode(paths);
  const contents = new Map<string, NodeContent>();
  const nodes: SceneNode[] = [];
  const missing: string[] = [];
  const unsized: string[] = [];
  for (const node of projection.nodes) {
    const at = layout.positions[node.id];
    const size = options.sizes.get(node.id);
    if (at === undefined) missing.push(node.id);
    if (size === undefined) unsized.push(node.id);
    if (at === undefined || size === undefined) continue;
    const content = contentOf(node, ports);
    contents.set(node.id, content);
    nodes.push({
      id: node.id,
      glyph: content.glyph,
      box: content.box,
      x: at.x,
      y: at.y,
      width: size.width,
      height: size.height,
      label: content.label,
      ...(content.sublabel === undefined ? {} : { sublabel: content.sublabel }),
      ...(content.depictionKey === undefined ? {} : { depictionKey: content.depictionKey }),
      badges: badgesOf(node),
      ...(node.arrangement?.group === undefined ? {} : { group: node.arrangement.group }),
      ...(node.arrangement?.tone === undefined ? {} : { tone: node.arrangement.tone }),
      emphasis: EMPHASIS[node.role],
      state: { dimmed: node.flags.includes('outside_scope'), onPath: false },
      minLod: minLodOf(content),
      ariaLabel: nodeAria(node, content, counts.get(node.id)),
    });
  }
  const boxes = new Map(nodes.map((node) => [node.id, node]));
  const isHub = (id: string): boolean => {
    const box = contents.get(id)?.box;
    return box === 'hub' || box === 'unclassified';
  };
  const edges: SceneEdge[] = [];
  let width = layout.bounds.width;
  let height = layout.bounds.height;
  for (const path of paths) {
    const owner = boxes.get(path.from);
    const labelSize = options.labelSizes?.get(path.id);
    const loop = path.loop && owner !== undefined ? loopGeometry(owner, labelSize) : undefined;
    const points = loop?.points ?? (path.loop ? undefined : layout.edgeRoutes[path.id]);
    if (points === undefined || points.length === 0) {
      if (!path.loop || owner !== undefined) missing.push(path.id);
      continue;
    }
    for (const p of points) {
      width = Math.max(width, p.x);
      height = Math.max(height, p.y);
    }
    const style = styleOf(path.edges, isHub(path.from) && isHub(path.to));
    const labelAt = loop?.labelAt ?? labelCentre(layout.labelPositions?.[path.id], labelSize) ?? midpoint(points);
    if (labelSize !== undefined) {
      width = Math.max(width, labelAt.x + labelSize.width / 2);
      height = Math.max(height, labelAt.y + labelSize.height / 2);
    }
    const structural = style.semantic === 'membership' || style.semantic === 'overflow';
    edges.push({
      id: path.id,
      from: path.from,
      to: path.to,
      points,
      semantic: style.semantic,
      stroke: style.stroke,
      weight: style.weight,
      arrowHead: style.arrowHead,
      labelAt,
      ...arrowText(path, ports),
      ...(path.bundled || (path.loop && !structural) ? { bundleSize: path.total } : {}),
      minLod: structural ? 1 : 0,
      ariaLabel: edgeAria(path, style.semantic, contents.get(path.from)?.name ?? path.from, contents.get(path.to)?.name ?? path.to, path.edges.length, style.viaMembership),
    });
  }
  if (unsized.length > 0) return { ok: false, code: 'MISSING_SIZE', missing: unsized, message: `${unsized.length} nodes have no size, first "${unsized[0]}"` };
  if (missing.length > 0) return { ok: false, code: 'LAYOUT_MISMATCH', missing, message: `the layout result does not answer the projection: ${missing.length} missing, first "${missing[0]}"` };
  return {
    ok: true,
    scene: {
      revision: projection.revision,
      projectionKey: projection.key,
      layoutKey: layout.cacheKey,
      nodes,
      edges,
      bounds: { width, height },
      truncation: projection.truncation,
    },
  };
}
