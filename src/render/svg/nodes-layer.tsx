/**
 * The nodes layer (step 5.4a): the glyph of every node (UI_ARCHITECTURE §3) in a group at the node's corner. The group carries the
 * node id (hit testing is 5.5a and 5.7), its accessible name (the Scene's `ariaLabel`) and a `<title>` with the full text, so a label
 * clipped to its box is still reachable. At LOD 3 a species shows its depiction as an `<image href>` once it is ready (never inlined
 * markup; SECURITY §2); while loading, after a timeout or when unavailable the labels layer shows the name and formula instead.
 */
import { memo } from 'react';
import type { LodLevel, Scene, SceneNode } from '@/render/scene';
import type { DepictionSource, DepictionStatus, LayerName } from './contracts';
import { BOX_DASH, HUB_RULE_WIDTH, visibleAt } from './geometry';
import styles from './scene-svg.module.css';
import { plainText } from './text';
import { useCommitProbe } from './use-commit-probe';
import { useDepiction } from './use-depiction';

/** The depiction key to ask for: a node that has one, at LOD 3. */
export const wantedDepiction = (node: SceneNode, lod: LodLevel): string | undefined => (lod >= 3 ? node.depictionKey : undefined);

/** True when the structure is drawn in place of the name and formula. */
export const showsDepiction = (status: DepictionStatus): boolean => status.state === 'ready';

function Shape(props: { readonly node: SceneNode }) {
  const { node } = props;
  const { width, height } = node;
  const strength = node.emphasis === 'target' ? styles.target : node.state.onPath ? styles.onPath : undefined;
  const join = (...names: (string | undefined)[]): string => names.filter((name): name is string => name !== undefined).join(' ');
  switch (node.box) {
    case 'hub':
      return (
        <>
          <rect className={styles.hubBlock} width={width} height={height} />
          <rect className={styles.hubRule} width={HUB_RULE_WIDTH} height={height} />
        </>
      );
    case 'unclassified':
      return <rect className={join(styles.unclassified, strength)} width={width} height={height} rx={2} strokeDasharray={BOX_DASH.unclassified} />;
    case 'overflow':
      return <rect className={join(styles.overflow, strength)} width={width} height={height} rx={2} strokeDasharray={BOX_DASH.overflow} />;
    case 'reagent':
      return <rect className={join(styles.chip, strength)} width={width} height={height} rx={Math.min(height / 2, 12)} />;
    case 'member':
      return <rect className={join(styles.member, strength)} width={width} height={height} rx={2} />;
    case 'species':
      return <rect className={join(styles.box, strength)} width={width} height={height} rx={2} />;
  }
}

function NodeGroup(props: { readonly node: SceneNode; readonly lod: LodLevel; readonly source: DepictionSource | undefined }) {
  const { node, lod } = props;
  const status = useDepiction(props.source, wantedDepiction(node, lod));
  const full = [plainText(node.label), node.sublabel === undefined ? '' : plainText(node.sublabel)].filter((text) => text !== '').join(' · ');
  return (
    <g
      transform={`translate(${node.x} ${node.y})`}
      className={node.state.dimmed ? styles.dimmed : undefined}
      data-node-id={node.id}
      data-glyph={node.glyph}
      data-box={node.box}
      role="graphics-symbol"
      aria-label={node.ariaLabel}
    >
      <title>{full}</title>
      <Shape node={node} />
      {status.state === 'ready' ? <image className={styles.depiction} href={status.url} x={4} y={4} width={Math.max(0, node.width - 8)} height={Math.max(0, node.height - 8)} preserveAspectRatio="xMidYMid meet" /> : null}
    </g>
  );
}

export const NodesLayer = memo(function NodesLayer(props: { readonly scene: Scene; readonly lod: LodLevel; readonly depictions: DepictionSource | undefined; readonly onCommit?: (layer: LayerName) => void }) {
  useCommitProbe('nodes', props.onCommit);
  return (
    <g data-layer="nodes">
      {props.scene.nodes.filter((node) => visibleAt(node, props.lod)).map((node) => (
        <NodeGroup key={node.id} node={node} lod={props.lod} source={props.depictions} />
      ))}
    </g>
  );
});
