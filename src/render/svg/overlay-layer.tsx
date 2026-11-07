/**
 * The overlay layer (step 5.4a; decision Q5): selection and the focus ring, drawn from the Scene's boxes and routes and from two
 * props (selected ids, the focused id). Nothing else draws them, so a selection or focus change re-renders this layer and no other.
 * Selection is a solid outline (a thick translucent stroke along an edge), the focus ring a dashed one: neither is told apart by
 * colour only. An id that is not drawn at this LOD (or not in the Scene) draws nothing. The layer takes no pointer events.
 */
import { memo } from 'react';
import type { LodLevel, Scene, SceneEdge, SceneNode } from '@/render/scene';
import type { LayerName, MapMarks } from './contracts';
import { halfOf } from './pair-direction';
import type { DefIds } from './defs';
import { FOCUS_PAD, HUB_RADIUS, pathData, SELECTION_PAD, visibleAt } from './geometry';
import outline from './outline.module.css';
import styles from './scene-svg.module.css';
import { useCommitProbe } from './use-commit-probe';

function Box(props: { readonly node: SceneNode; readonly pad: number; readonly className: string | undefined; readonly kind: 'selected' | 'focus' }) {
  const { node, pad } = props;
  return <rect className={props.className} data-overlay={props.kind} data-overlay-id={node.id} x={node.x - pad} y={node.y - pad} width={node.width + 2 * pad} height={node.height + 2 * pad} rx={2 + pad} />;
}

function Route(props: { readonly edge: SceneEdge; readonly className: string | undefined; readonly kind: 'selected' | 'focus' | 'hover'; readonly ids: DefIds; readonly half?: boolean }) {
  const { edge, kind } = props;
  const half = props.half === true ? halfOf(edge.points) : edge.points;
  // a hovered or selected arrow carries its own accent head (the edges layer's ink head lies under it)
  const head = kind !== 'focus' && edge.arrowHead !== 'none' ? { markerEnd: `url(#${props.ids.accent})` } : {};
  return <path className={props.className} data-overlay={kind} data-overlay-id={edge.id} d={pathData(half)} {...head} />;
}

/** The outline of a family at an end of an emphasised arrow: not a selection of the family. */
function EndBox(props: { readonly node: SceneNode }) {
  const { node } = props;
  const pad = SELECTION_PAD;
  return <rect className={styles.endBox} data-overlay="end" data-overlay-id={node.id} x={node.x - pad} y={node.y - pad} width={node.width + 2 * pad} height={node.height + 2 * pad} rx={HUB_RADIUS + pad} />;
}

export const OverlayLayer = memo(function OverlayLayer(props: {
  readonly scene: Scene;
  readonly lod: LodLevel;
  readonly ids: DefIds;
  readonly selectedIds: ReadonlySet<string>;
  readonly focusedId: string | undefined;
  readonly hoveredId?: string | undefined;
  readonly marks?: MapMarks | undefined;
  readonly onCommit?: (layer: LayerName) => void;
}) {
  useCommitProbe('overlay', props.onCommit);
  const { scene, lod, selectedIds, focusedId, hoveredId, ids } = props;
  const nodes = scene.nodes.filter((node) => visibleAt(node, lod) && (selectedIds.has(node.id) || node.id === focusedId));
  // a two-way pair is one line (step 8.4b, B): each direction is emphasised by its own half, ending at its head; the back direction is not in the Scene
  const withPairs = scene.edges.flatMap((edge) => {
    const pair = props.marks?.edges.get(edge.id)?.pair;
    return pair === undefined ? [edge] : [edge, { ...edge, id: pair.backId, from: edge.to, to: edge.from, points: [...edge.points].reverse() }];
  });
  const pairIds = new Set(withPairs.filter((edge) => props.marks?.edges.get(edge.id)?.pair !== undefined).map((edge) => edge.id));
  for (const mark of props.marks?.edges.values() ?? []) if (mark.pair !== undefined) pairIds.add(mark.pair.backId);
  const isHalf = (id: string): boolean => pairIds.has(id);
  const edges = withPairs.filter((edge) => visibleAt(edge, lod) && (selectedIds.has(edge.id) || edge.id === focusedId));
  const hovered = hoveredId === undefined ? undefined : withPairs.find((edge) => edge.id === hoveredId && visibleAt(edge, lod) && !selectedIds.has(edge.id));
  // the two families at the ends of every emphasised arrow (selected or hovered), once each
  const emphasised = [...edges.filter((edge) => selectedIds.has(edge.id)), ...(hovered === undefined ? [] : [hovered])];
  const endIds = new Set(emphasised.flatMap((edge) => [edge.from, edge.to]));
  const ends = scene.nodes.filter((node) => endIds.has(node.id) && visibleAt(node, lod));
  const outlined = props.marks?.outlined === undefined ? [] : scene.nodes.filter((node) => props.marks?.outlined?.has(node.id) === true && visibleAt(node, lod));
  return (
    <g data-layer="overlay" aria-hidden="true" pointerEvents="none">
      {outlined.map((node) => (
        <rect key={`o-${node.id}`} className={outline.outlined} data-tone={props.marks?.outlined?.get(node.id)} data-overlay="outlined" data-overlay-id={node.id} x={node.x - SELECTION_PAD} y={node.y - SELECTION_PAD} width={node.width + 2 * SELECTION_PAD} height={node.height + 2 * SELECTION_PAD} rx={HUB_RADIUS + SELECTION_PAD} />
      ))}
      {ends.map((node) => <EndBox key={`e-${node.id}`} node={node} />)}
      {nodes.filter((node) => selectedIds.has(node.id)).map((node) => <Box key={`s-${node.id}`} node={node} pad={SELECTION_PAD} className={styles.selected} kind="selected" />)}
      {edges.filter((edge) => selectedIds.has(edge.id)).map((edge) => <Route key={`s-${edge.id}`} edge={edge} className={styles.selectedEdge} kind="selected" ids={ids} half={isHalf(edge.id)} />)}
      {hovered === undefined ? null : <Route key={`h-${hovered.id}`} edge={hovered} className={styles.hoverEdge} kind="hover" ids={ids} half={isHalf(hovered.id)} />}
      {nodes.filter((node) => node.id === focusedId).map((node) => <Box key={`f-${node.id}`} node={node} pad={FOCUS_PAD} className={styles.focus} kind="focus" />)}
      {edges.filter((edge) => edge.id === focusedId).map((edge) => <Route key={`f-${edge.id}`} edge={edge} className={styles.focus} kind="focus" ids={ids} />)}
    </g>
  );
});
