/**
 * The overlay layer (step 5.4a; decision Q5): selection and the focus ring, drawn from the Scene's boxes and routes and from two
 * props (selected ids, the focused id). Nothing else draws them, so a selection or focus change re-renders this layer and no other.
 * Selection is a solid outline (a thick translucent stroke along an edge), the focus ring a dashed one: neither is told apart by
 * colour only. An id that is not drawn at this LOD (or not in the Scene) draws nothing. The layer takes no pointer events.
 */
import { memo } from 'react';
import type { LodLevel, Scene, SceneEdge, SceneNode } from '@/render/scene';
import type { LayerName } from './contracts';
import { FOCUS_PAD, pathData, SELECTION_PAD, visibleAt } from './geometry';
import styles from './scene-svg.module.css';
import { useCommitProbe } from './use-commit-probe';

function Box(props: { readonly node: SceneNode; readonly pad: number; readonly className: string | undefined; readonly kind: 'selected' | 'focus' }) {
  const { node, pad } = props;
  return <rect className={props.className} data-overlay={props.kind} data-overlay-id={node.id} x={node.x - pad} y={node.y - pad} width={node.width + 2 * pad} height={node.height + 2 * pad} rx={2 + pad} />;
}

function Route(props: { readonly edge: SceneEdge; readonly className: string | undefined; readonly kind: 'selected' | 'focus' }) {
  return <path className={props.className} data-overlay={props.kind} data-overlay-id={props.edge.id} d={pathData(props.edge.points)} />;
}

export const OverlayLayer = memo(function OverlayLayer(props: {
  readonly scene: Scene;
  readonly lod: LodLevel;
  readonly selectedIds: ReadonlySet<string>;
  readonly focusedId: string | undefined;
  readonly onCommit?: (layer: LayerName) => void;
}) {
  useCommitProbe('overlay', props.onCommit);
  const { scene, lod, selectedIds, focusedId } = props;
  const nodes = scene.nodes.filter((node) => visibleAt(node, lod) && (selectedIds.has(node.id) || node.id === focusedId));
  const edges = scene.edges.filter((edge) => visibleAt(edge, lod) && (selectedIds.has(edge.id) || edge.id === focusedId));
  return (
    <g data-layer="overlay" aria-hidden="true" pointerEvents="none">
      {nodes.filter((node) => selectedIds.has(node.id)).map((node) => <Box key={`s-${node.id}`} node={node} pad={SELECTION_PAD} className={styles.selected} kind="selected" />)}
      {edges.filter((edge) => selectedIds.has(edge.id)).map((edge) => <Route key={`s-${edge.id}`} edge={edge} className={styles.selectedEdge} kind="selected" />)}
      {nodes.filter((node) => node.id === focusedId).map((node) => <Box key={`f-${node.id}`} node={node} pad={FOCUS_PAD} className={styles.focus} kind="focus" />)}
      {edges.filter((edge) => edge.id === focusedId).map((edge) => <Route key={`f-${edge.id}`} edge={edge} className={styles.focus} kind="focus" />)}
    </g>
  );
});
