/**
 * The badges layer (step 5.4a), from LOD 2 on: small monochrome marks on a node's top edge (caveat, mechanism, review, warning,
 * error, outside scope, hidden neighbours; each a different SHAPE with a mark and a `<title>` on hover) and the count of a bundle at
 * its label point. The meaning is also in the node's and edge's accessible name (the Scene builder wrote the counts and flags in
 * words), so the layer is hidden from assistive technology.
 */
import { memo } from 'react';
import { CHIP_HEIGHT, chipWidth, countWidth, type LodLevel, type Scene, type SceneBadge, type SceneEdge, type SceneNode } from '@/render/scene';
import type { LayerName } from './contracts';
import { BADGE_GAP, BADGE_MARK, BADGE_SIZE, visibleAt } from './geometry';
import styles from './scene-svg.module.css';
import { useCommitProbe } from './use-commit-probe';

const SHAPE_CLASS: Readonly<Partial<Record<SceneBadge['kind'], string>>> = { review: styles.badgeShapeReview, warning: styles.badgeShapeWarning, error: styles.badgeShapeError };

function Shape(props: { readonly shape: (typeof BADGE_MARK)[SceneBadge['kind']]['shape']; readonly width: number; readonly className: string }) {
  const { shape, width, className } = props;
  const half = BADGE_SIZE / 2;
  switch (shape) {
    case 'circle':
      return <circle className={className} cx={half} cy={half} r={half - 0.5} />;
    case 'square':
      return <rect className={className} x={0.5} y={0.5} width={BADGE_SIZE - 1} height={BADGE_SIZE - 1} />;
    case 'diamond':
      return <path className={className} d={`M${half} 0.5 L${BADGE_SIZE - 0.5} ${half} L${half} ${BADGE_SIZE - 0.5} L0.5 ${half} Z`} />;
    case 'triangle':
      return <path className={className} d={`M${half} 0.5 L${BADGE_SIZE - 0.5} ${BADGE_SIZE - 0.5} L0.5 ${BADGE_SIZE - 0.5} Z`} />;
    case 'pill':
      return <rect className={className} x={0.5} y={0.5} width={width - 1} height={BADGE_SIZE - 1} rx={half - 0.5} />;
  }
}

function NodeBadges(props: { readonly node: SceneNode }) {
  const { node } = props;
  let right = node.width;
  return (
    <g transform={`translate(${node.x} ${node.y - BADGE_SIZE / 2})`} data-badges-of={node.id}>
      {node.badges.map((badge) => {
        const mark = BADGE_MARK[badge.kind];
        const width = badge.kind === 'hidden_neighbours' && badge.count !== undefined ? countWidth(badge.count) : BADGE_SIZE;
        right -= width + BADGE_GAP;
        const title = badge.count === undefined ? mark.title : `${mark.title}: ${badge.count}`;
        const text = badge.count === undefined ? mark.mark : `${mark.mark}${badge.count}`;
        return (
          <g key={badge.kind} transform={`translate(${right + BADGE_GAP} 0)`} data-badge-kind={badge.kind} data-shape={mark.shape}>
            <title>{title}</title>
            <Shape shape={mark.shape} width={width} className={`${styles.badgeShape}${SHAPE_CLASS[badge.kind] === undefined ? '' : ` ${SHAPE_CLASS[badge.kind]}`}`} />
            <text className={styles.badgeMark} x={width / 2} y={BADGE_SIZE - 3.5}>
              {text}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function BundleCount(props: { readonly edge: SceneEdge; readonly size: number }) {
  const { edge, size } = props;
  const width = chipWidth(size);
  const name = `${size} ${size === 1 ? 'reaction' : 'reactions'}`;
  return (
    <g transform={`translate(${edge.labelAt.x - width / 2} ${edge.labelAt.y - CHIP_HEIGHT / 2})`} data-count-of={edge.id} data-chip-width={width} data-chip-height={CHIP_HEIGHT} role="img" aria-label={name}>
      <title>{name}</title>
      <rect className={styles.chipPill} x={0.5} y={0.5} width={width - 1} height={CHIP_HEIGHT - 1} rx={CHIP_HEIGHT / 2 - 0.5} />
      <text className={styles.count} x={width / 2} y={CHIP_HEIGHT / 2 + 4.2}>
        {size}
      </text>
    </g>
  );
}

export const BadgesLayer = memo(function BadgesLayer(props: { readonly scene: Scene; readonly lod: LodLevel; readonly onCommit?: (layer: LayerName) => void }) {
  useCommitProbe('badges', props.onCommit);
  const { scene, lod } = props;
  return (
    <g data-layer="badges" aria-hidden="true">
      {lod >= 2 ? scene.nodes.filter((node) => node.badges.length > 0 && visibleAt(node, lod)).map((node) => <NodeBadges key={node.id} node={node} />) : null}
      {lod >= 1
        ? scene.edges.filter((edge) => edge.bundleSize !== undefined && visibleAt(edge, lod)).map((edge) => <BundleCount key={edge.id} edge={edge} size={edge.bundleSize as number} />)
        : null}
    </g>
  );
});
