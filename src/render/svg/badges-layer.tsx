/**
 * The badges layer (step 5.4a), from LOD 2 on: small monochrome marks on a node's top edge (caveat, mechanism, review, warning,
 * error, outside scope, hidden neighbours; each a different SHAPE with a mark and a `<title>` on hover) and the count of a bundle at
 * its label point. The meaning is also in the node's and edge's accessible name (the Scene builder wrote the counts and flags in
 * words), so the layer is hidden from assistive technology.
 */
import { memo } from 'react';
import type { MapMarks, SceneHit } from './contracts';
import { CHIP_HEIGHT, chipTextWidth, chipWidth, countWidth, type FormattedText, type LodLevel, type Scene, type SceneBadge, type SceneEdge, type SceneNode } from '@/render/scene';
import type { LayerName } from './contracts';
import type { Point } from '@/layout/contracts';
import { BADGE_GAP, BADGE_MARK, BADGE_SIZE, visibleAt } from './geometry';
import styles from './scene-svg.module.css';
import { Runs } from './text';
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

/** The width of a chip's text: a plain number as before, words or a step by the length of the text (step 8.2b). */
/** The chip's font size (scene-svg.module.css, .count): the subscript shift is a fraction of it. */
const CHIP_FONT = 12;
const widthOfText = (text: string): number => (/^[0-9]+$/.test(text) ? chipWidth(Number(text)) : chipTextWidth(text));

interface ChipProps {
  readonly at: Point;
  readonly text: string;
  readonly runs?: FormattedText | undefined;
  /** The attribute that names the chip's edge for tests and measuring (`data-count-of` or `data-count-extra-of`). */
  readonly attr: 'data-count-of' | 'data-count-extra-of';
  readonly edgeId: string;
  readonly name: string;
  /** A pair's chip is a button for ITS direction (step 8.4b, B): `hitId` is the arrow it chooses. */
  readonly button?: { readonly hitId: string; readonly onChip?: ((hit: SceneHit) => void) | undefined };
}

/** A chip is drawn at its screen size (CSS counter-scales the inner group about the chip's centre); `at` is its centre in map units. */
function Chip(props: ChipProps) {
  const { at, text, runs, name, button } = props;
  const width = widthOfText(text);
  const marks = { [props.attr]: props.edgeId } as Record<string, string>;
  const pick = (event: { readonly key: string; preventDefault: () => void; stopPropagation: () => void }): void => {
    if (button === undefined || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    event.stopPropagation();
    button.onChip?.({ kind: 'edge', id: button.hitId });
  };
  const extra = button === undefined ? { role: 'img', 'aria-label': name, 'aria-hidden': true as const } : { role: 'button', tabIndex: 0, 'aria-label': name, 'data-chip-button': 'true', 'data-hit-edge': button.hitId, onKeyDown: pick };
  return (
    <g transform={`translate(${at.x} ${at.y})`} {...marks} data-chip-width={width} data-chip-height={CHIP_HEIGHT} {...extra}>
      <g className={styles.chipScale}>
        <title>{name}</title>
        <rect className={styles.chipPill} x={-width / 2} y={-CHIP_HEIGHT / 2} width={width} height={CHIP_HEIGHT} rx={CHIP_HEIGHT / 2} />
        <text className={styles.count} x={0} y={4.2}>
          {runs === undefined ? text : <Runs runs={runs} size={CHIP_FONT} />}
        </text>
      </g>
    </g>
  );
}

const centreOf = (edge: SceneEdge, at: Point | undefined): Point => at ?? edge.labelAt;

export const BadgesLayer = memo(function BadgesLayer(props: { readonly scene: Scene; readonly lod: LodLevel; readonly marks?: MapMarks | undefined; readonly onChip?: ((hit: SceneHit) => void) | undefined; readonly onCommit?: (layer: LayerName) => void }) {
  useCommitProbe('badges', props.onCommit);
  const { scene, lod, onChip } = props;
  return (
    <g data-layer="badges">
      {lod >= 2 ? <g aria-hidden="true">{scene.nodes.filter((node) => node.badges.length > 0 && visibleAt(node, lod)).map((node) => <NodeBadges key={node.id} node={node} />)}</g> : null}
      {lod >= 1
        ? scene.edges.flatMap((edge) => {
            const mark = props.marks?.edges.get(edge.id);
            const chip = mark?.chip;
            if (!visibleAt(edge, lod) || (edge.bundleSize === undefined && chip === undefined) || mark?.chipHidden === true) return [];
            const size = edge.bundleSize ?? 1;
            const text = chip?.text ?? String(size);
            const plain = chip?.name ?? `${size} ${size === 1 ? 'reaction' : 'reactions'}`;
            const pair = mark?.pair;
            return [
              <Chip
                key={edge.id}
                attr="data-count-of"
                edgeId={edge.id}
                at={centreOf(edge, chip?.at)}
                text={text}
                runs={chip?.runs}
                name={pair === undefined ? plain : `${pair.forwardName}, ${size} ${size === 1 ? 'reaction' : 'reactions'}`}
                {...(pair === undefined ? {} : { button: { hitId: edge.id, onChip } })}
              />,
            ];
          })
        : null}
      {lod >= 1 && props.marks !== undefined
        ? scene.edges.flatMap((edge) => {
            const mark = props.marks?.edges.get(edge.id);
            const chip = mark?.extraChip;
            if (chip === undefined || chip.hidden === true || !visibleAt(edge, lod)) return [];
            const pair = mark?.pair;
            return [
              <Chip
                key={`extra-${edge.id}`}
                attr="data-count-extra-of"
                edgeId={edge.id}
                at={chip.at}
                text={chip.text ?? String(chip.size)}
                runs={chip.runs}
                name={pair === undefined ? (chip.name ?? String(chip.size)) : `${pair.backName}, ${chip.size} ${chip.size === 1 ? 'reaction' : 'reactions'}`}
                {...(pair === undefined ? {} : { button: { hitId: pair.backId, onChip } })}
              />,
            ];
          })
        : null}
    </g>
  );
});
