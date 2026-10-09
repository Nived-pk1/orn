/**
 * The edges layer (step 5.4a): one group per edge, carrying its id (hit testing is 5.5a and 5.7) and its accessible name, with a
 * path whose dash pattern and width come from the Scene's stroke and weight (not from colour) and an arrowhead marker. A bundle is
 * one edge; a self-loop is an edge with `from === to` whose points already describe the loop (the builder drew it).
 */
import { memo } from 'react';
import type { LodLevel, Scene, SceneEdge } from '@/render/scene';
import type { DefIds } from './defs';
import type { LayerName } from './contracts';
import { EDGE_HIT_WIDTH, pathData, STROKE_DASH, visibleAt, WEIGHT_WIDTH } from './geometry';
import styles from './scene-svg.module.css';
import { useCommitProbe } from './use-commit-probe';

function EdgeGroup(props: { readonly edge: SceneEdge; readonly ids: DefIds }) {
  const { edge, ids } = props;
  const dash = STROKE_DASH[edge.stroke];
  const classes = [styles.edge, edge.weight === 'heavy' ? styles.edgeHeavy : undefined, edge.stroke === 'dotted' ? styles.edgeDotted : undefined].filter((name): name is string => name !== undefined).join(' ');
  const marker = edge.arrowHead === 'filled' ? `url(#${ids.filled})` : edge.arrowHead === 'open' ? `url(#${ids.open})` : undefined;
  return (
    <g data-edge-id={edge.id} data-from={edge.from} data-to={edge.to} data-semantic={edge.semantic} data-stroke={edge.stroke} data-weight={edge.weight} role="graphics-symbol" aria-label={edge.ariaLabel}>
      <title>{edge.ariaLabel}</title>
      <path
        className={classes}
        d={pathData(edge.points)}
        strokeWidth={WEIGHT_WIDTH[edge.weight]}
        {...(dash === undefined ? {} : { strokeDasharray: dash })}
        {...(marker === undefined ? {} : { markerEnd: marker })}
      />
      <path className={styles.edgeHit} d={pathData(edge.points)} strokeWidth={EDGE_HIT_WIDTH} data-hit="true" aria-hidden="true" />
    </g>
  );
}

export const EdgesLayer = memo(function EdgesLayer(props: { readonly scene: Scene; readonly lod: LodLevel; readonly ids: DefIds; readonly onCommit?: (layer: LayerName) => void }) {
  useCommitProbe('edges', props.onCommit);
  return (
    <g data-layer="edges">
      {props.scene.edges.filter((edge) => visibleAt(edge, props.lod)).map((edge) => (
        <EdgeGroup key={edge.id} edge={edge} ids={props.ids} />
      ))}
    </g>
  );
});
