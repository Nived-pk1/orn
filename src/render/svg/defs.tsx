/**
 * Shared definitions (step 5.4a): the two arrowheads as SVG markers and one clip rectangle per distinct node size. Node boxes sit on
 * a 4 px grid (note E6), so a scene has a handful of sizes, not one clip path per node. A clip rectangle is in the node's own
 * coordinates (the referencing group sits at the node's origin).
 */
import { memo } from 'react';
import type { Scene } from '@/render/scene';
import { ARROW_SIZE, HUB_RADIUS } from './geometry';
import styles from './scene-svg.module.css';

export interface DefIds {
  readonly filled: string;
  readonly open: string;
  readonly clip: (width: number, height: number) => string;
  /** The rounded clip of a hub card of that size (step 5.5c): the tone's left rule is cut to the card's rounded corners. */
  readonly hubClip: (width: number, height: number) => string;
}

const token = (value: number): string => String(value).replace(/[^0-9a-z]/gi, '_');

/** `prefix` must be unique per drawing on the page and made of letters, digits, `-` and `_`. */
export const defIds = (prefix: string): DefIds => ({
  filled: `${prefix}-arrow-filled`,
  open: `${prefix}-arrow-open`,
  clip: (width, height) => `${prefix}-clip-${token(width)}x${token(height)}`,
  hubClip: (width, height) => `${prefix}-hub-${token(width)}x${token(height)}`,
});

const half = ARROW_SIZE / 2;

export const SceneDefs = memo(function SceneDefs(props: { readonly scene: Scene; readonly ids: DefIds }) {
  const { scene, ids } = props;
  const sizes = new Map<string, { width: number; height: number }>();
  const hubs = new Map<string, { width: number; height: number }>();
  for (const node of scene.nodes) {
    sizes.set(ids.clip(node.width, node.height), { width: node.width, height: node.height });
    if (node.box === 'hub') hubs.set(ids.hubClip(node.width, node.height), { width: node.width, height: node.height });
  }
  return (
    <defs>
      <marker id={ids.filled} markerUnits="userSpaceOnUse" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE} refY={half} orient="auto">
        <path className={styles.markerFilled} d={`M0 0 L${ARROW_SIZE} ${half} L0 ${ARROW_SIZE} Z`} />
      </marker>
      <marker id={ids.open} markerUnits="userSpaceOnUse" markerWidth={ARROW_SIZE} markerHeight={ARROW_SIZE} refX={ARROW_SIZE - 1} refY={half} orient="auto">
        <path className={styles.markerOpen} d={`M0 0 L${ARROW_SIZE - 1} ${half} L0 ${ARROW_SIZE}`} />
      </marker>
      {[...sizes.entries()].map(([id, size]) => (
        <clipPath key={id} id={id}>
          <rect x={0} y={0} width={size.width} height={size.height} />
        </clipPath>
      ))}
      {[...hubs.entries()].map(([id, size]) => (
        <clipPath key={id} id={id}>
          <rect x={0} y={0} width={size.width} height={size.height} rx={HUB_RADIUS} />
        </clipPath>
      ))}
    </defs>
  );
});
