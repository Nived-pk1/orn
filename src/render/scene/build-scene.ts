/**
 * buildScene (step 5.3): projection + layout result + sizes -> Scene, pure and deterministic. Every projection node is a scene
 * node and every drawn path (see `paths.ts`) is a scene edge, so nothing is dropped; the Scene copies the projection's
 * truncation and counts a bundle's TOTAL. No record is copied into it beyond what is drawn (names and formulas come through the
 * ports as text). A layout result that does not answer the projection (a stale result) is refused as a value, never patched.
 */
import type { GraphNode, NodeFlag, Projection } from '@/core/graph/contracts';
import { parseRichText } from '@/core/text';
import type { LayoutResult, Point } from '@/layout/contracts';
import { countsByNode, edgeAria, nodeAria } from './aria';
import type { FormattedText, LodLevel, NodeSizes, Scene, SceneBadge, SceneEdge, SceneNode, ScenePorts } from './contracts';
import { styleOf } from './edge-style';
import { richToRuns } from './formatted-text';
import { loopGeometry } from './loops';
import { contentOf, type NodeContent } from './node-content';
import { drawnPaths, type DrawnPath } from './paths';

export interface SceneOptions {
  /** The sizes the layout request was built from (`nodeSizes`); the layout result holds corners only. */
  readonly sizes: NodeSizes;
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
  if (path.bundled || edge.semantic === 'membership' || edge.semantic === 'overflow') return {};
  const text = ports.arrowTextOf(edge);
  const above = text?.above === undefined ? [] : richToRuns(parseRichText(text.above));
  const below = text?.below === undefined ? [] : richToRuns(parseRichText(text.below));
  return { ...(above.length === 0 ? {} : { above }), ...(below.length === 0 ? {} : { below }) };
}

export function buildScene(projection: Projection, layout: LayoutResult, options: SceneOptions, ports: ScenePorts): SceneResult {
  const paths = drawnPaths(projection);
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
      x: at.x,
      y: at.y,
      width: size.width,
      height: size.height,
      label: content.label,
      ...(content.sublabel === undefined ? {} : { sublabel: content.sublabel }),
      ...(content.depictionKey === undefined ? {} : { depictionKey: content.depictionKey }),
      badges: badgesOf(node),
      emphasis: EMPHASIS[node.role],
      state: { dimmed: node.flags.includes('outside_scope'), onPath: false },
      minLod: minLodOf(content),
      ariaLabel: nodeAria(node, content, counts.get(node.id)),
    });
  }
  const boxes = new Map(nodes.map((node) => [node.id, node]));
  const edges: SceneEdge[] = [];
  let width = layout.bounds.width;
  let height = layout.bounds.height;
  for (const path of paths) {
    const owner = boxes.get(path.from);
    const loop = path.loop && owner !== undefined ? loopGeometry(owner) : undefined;
    const points = loop?.points ?? (path.loop ? undefined : layout.edgeRoutes[path.id]);
    if (points === undefined || points.length === 0) {
      if (!path.loop || owner !== undefined) missing.push(path.id);
      continue;
    }
    for (const p of points) {
      width = Math.max(width, p.x);
      height = Math.max(height, p.y);
    }
    const style = styleOf(path.edges);
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
      labelAt: loop?.labelAt ?? midpoint(points),
      ...arrowText(path, ports),
      ...(path.bundled ? { bundleSize: path.total } : {}),
      minLod: structural ? 1 : 0,
      ariaLabel: edgeAria(path, style.semantic, contents.get(path.from)?.name ?? path.from, contents.get(path.to)?.name ?? path.to, path.edges.length),
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
