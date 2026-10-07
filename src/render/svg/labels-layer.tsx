/**
 * The labels layer (step 5.4a): the name and formula of every node from LOD 1 on, and the text over and under an arrow from LOD 2
 * on. Each node's text is clipped to its box (a clip path per distinct box size, see defs.tsx), because a very long name is capped at
 * the box's maximum width by the Scene builder; the full text stays reachable through the node's `<title>` and accessible name
 * (nodes layer). The layer is hidden from assistive technology: the names are on the nodes and edges.
 * At LOD 3 a species whose depiction is ready shows no text (the structure replaces it); while it loads, after a timeout and when it
 * is unavailable the name and formula are shown, never an error.
 */
import { memo } from 'react';
import type { LodLevel, Scene, SceneEdge, SceneNode } from '@/render/scene';
import type { DefIds } from './defs';
import type { DepictionSource, LayerName } from './contracts';
import { ARROW_TEXT_LIFT, ARROW_TEXT_SIZE, textSlots, visibleAt } from './geometry';
import styles from './scene-svg.module.css';
import { Runs } from './text';
import { useCommitProbe } from './use-commit-probe';
import { useDepiction } from './use-depiction';
import { showsDepiction, wantedDepiction } from './nodes-layer';

function NodeLabel(props: { readonly node: SceneNode; readonly lod: LodLevel; readonly source: DepictionSource | undefined; readonly ids: DefIds }) {
  const { node } = props;
  const status = useDepiction(props.source, wantedDepiction(node, props.lod));
  if (showsDepiction(status)) return null;
  const slots = textSlots(node);
  return (
    <g transform={`translate(${node.x} ${node.y})`} data-label-of={node.id}>
      <g clipPath={`url(#${props.ids.clip(node.width, node.height)})`}>
        <text className={`${styles.label}${node.box === 'hub' || node.box === 'unclassified' ? ` ${styles.strong}` : ''}`} x={slots.x} y={slots.labelY} fontSize={slots.labelSize}>
          <Runs runs={node.label} size={slots.labelSize} />
        </text>
        {node.sublabel === undefined ? null : (
          <text className={`${styles.label} ${styles.sublabel}`} x={slots.x} y={slots.sublabelY} fontSize={slots.sublabelSize}>
            <Runs runs={node.sublabel} size={slots.sublabelSize} />
          </text>
        )}
      </g>
    </g>
  );
}

function ArrowText(props: { readonly edge: SceneEdge }) {
  const { edge } = props;
  if (edge.above === undefined && edge.below === undefined) return null;
  return (
    <g data-arrow-text-of={edge.id}>
      {edge.above === undefined ? null : (
        <text className={styles.arrowText} x={edge.labelAt.x} y={edge.labelAt.y - ARROW_TEXT_LIFT} fontSize={ARROW_TEXT_SIZE} data-side="above">
          <Runs runs={edge.above} size={ARROW_TEXT_SIZE} />
        </text>
      )}
      {edge.below === undefined ? null : (
        <text className={styles.arrowText} x={edge.labelAt.x} y={edge.labelAt.y + ARROW_TEXT_LIFT + ARROW_TEXT_SIZE} fontSize={ARROW_TEXT_SIZE} data-side="below">
          <Runs runs={edge.below} size={ARROW_TEXT_SIZE} />
        </text>
      )}
    </g>
  );
}

export const LabelsLayer = memo(function LabelsLayer(props: { readonly scene: Scene; readonly lod: LodLevel; readonly depictions: DepictionSource | undefined; readonly ids: DefIds; readonly onCommit?: (layer: LayerName) => void }) {
  useCommitProbe('labels', props.onCommit);
  const { scene, lod } = props;
  return (
    <g data-layer="labels" aria-hidden="true">
      {lod >= 1 ? scene.nodes.filter((node) => visibleAt(node, lod)).map((node) => <NodeLabel key={node.id} node={node} lod={lod} source={props.depictions} ids={props.ids} />) : null}
      {lod >= 2 ? scene.edges.filter((edge) => visibleAt(edge, lod)).map((edge) => <ArrowText key={edge.id} edge={edge} />) : null}
    </g>
  );
});
