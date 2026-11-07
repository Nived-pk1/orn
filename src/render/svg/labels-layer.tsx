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
import type { DepictionSource, LayerName, MapMarks } from './contracts';
import { BOXES } from '@/render/scene';
import { ARROW_LINE_HEIGHT, ARROW_TEXT_SIZE, textSlots, visibleAt } from './geometry';

const CAPTION_SIZE = 11;
import styles from './scene-svg.module.css';
import { Runs } from './text';
import { useCommitProbe } from './use-commit-probe';
import { useDepiction } from './use-depiction';
import { showsDepiction, wantedDepiction } from './nodes-layer';

function NodeLabel(props: { readonly node: SceneNode; readonly lod: LodLevel; readonly source: DepictionSource | undefined; readonly ids: DefIds; readonly faded?: boolean }) {
  const { node } = props;
  const status = useDepiction(props.source, wantedDepiction(node, props.lod));
  // A node with a structure area keeps its name when the structure is drawn (the formula gives way); any other node shows nothing then.
  const drawn = showsDepiction(status);
  if (drawn && node.depictionKey === undefined) return null;
  const slots = textSlots(node);
  return (
    <g transform={`translate(${node.x} ${node.y})`} data-label-of={node.id} {...(props.faded === true ? { className: styles.faded } : {})}>
      <g clipPath={`url(#${props.ids.clip(node.width, node.height)})`}>
        <text className={`${styles.label}${node.box === 'hub' || node.box === 'unclassified' ? ` ${styles.strong}` : ''}`} x={slots.x} y={slots.labelY} fontSize={slots.labelSize}>
          <Runs runs={node.label} size={slots.labelSize} />
        </text>
        {node.sublabel === undefined || drawn ? null : (
          <text
            className={`${styles.label} ${styles.sublabel}${slots.sublabelCentreX === undefined ? '' : ` ${styles.areaText}`}`}
            x={slots.sublabelCentreX ?? slots.x}
            y={slots.sublabelY}
            fontSize={slots.sublabelSize}
          >
            <Runs runs={node.sublabel} size={slots.sublabelSize} />
          </text>
        )}
      </g>
    </g>
  );
}

/** "↻ n" inside a family box, at the right end of the formula line (step 8.4b, D): reactions that start and end in the same family. */
function Loops(props: { readonly node: SceneNode; readonly text: string; readonly faded: boolean }) {
  const { node } = props;
  const slots = textSlots(node);
  const spec = BOXES[node.box];
  const k = node.scale ?? 1;
  const size = CAPTION_SIZE * k;
  const y = node.depictionKey === undefined ? slots.sublabelY : slots.labelY;
  return (
    <text className={`${styles.caption}${props.faded ? ` ${styles.faded}` : ''}`} data-loops-of={node.id} x={node.x + node.width - spec.padX * k} y={node.y + y} fontSize={size} textAnchor="end">
      {props.text}
    </text>
  );
}

function ArrowText(props: { readonly edge: SceneEdge }) {
  const { edge } = props;
  if (edge.above === undefined && edge.below === undefined) return null;
  // The lines (above, then below) are centred on `labelAt`, the centre of the box the layout reserved for them.
  const lines = [
    ...(edge.above === undefined ? [] : [{ side: 'above', runs: edge.above }]),
    ...(edge.below === undefined ? [] : [{ side: 'below', runs: edge.below }]),
  ];
  const top = edge.labelAt.y - (lines.length * ARROW_LINE_HEIGHT) / 2;
  return (
    <g data-arrow-text-of={edge.id}>
      {lines.map((line, i) => (
        <text key={line.side} className={styles.arrowText} x={edge.labelAt.x} y={top + i * ARROW_LINE_HEIGHT + ARROW_TEXT_SIZE * 0.9} fontSize={ARROW_TEXT_SIZE} data-side={line.side}>
          <Runs runs={line.runs} size={ARROW_TEXT_SIZE} />
        </text>
      ))}
    </g>
  );
}

export const LabelsLayer = memo(function LabelsLayer(props: { readonly scene: Scene; readonly lod: LodLevel; readonly depictions: DepictionSource | undefined; readonly ids: DefIds; readonly marks?: MapMarks | undefined; readonly onCommit?: (layer: LayerName) => void }) {
  useCommitProbe('labels', props.onCommit);
  const { scene, lod } = props;
  return (
    <g data-layer="labels" aria-hidden="true">
      {lod >= 1 ? scene.nodes.filter((node) => visibleAt(node, lod)).map((node) => <NodeLabel key={node.id} node={node} lod={lod} source={props.depictions} ids={props.ids} faded={props.marks?.faded.has(node.id) === true} />) : null}
      {lod >= 1 && props.marks !== undefined ? scene.nodes.filter((node) => props.marks?.captions.has(node.id) === true && visibleAt(node, lod)).map((node) => <Loops key={node.id} node={node} text={props.marks?.captions.get(node.id) ?? ''} faded={props.marks?.faded.has(node.id) === true} />) : null}
      {lod >= 2 ? scene.edges.filter((edge) => visibleAt(edge, lod)).map((edge) => <ArrowText key={edge.id} edge={edge} />) : null}
    </g>
  );
});
