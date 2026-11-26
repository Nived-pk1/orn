/**
 * The drawing of one mechanism step (step 8.5, ADR-038 D4-D6): the species of the before side, the reaction arrow, the species of the after
 * side, and the curved arrows of the electron movements. Structures are `<image>`s of the structure tool's own sanitised drawings (object
 * URLs from the port): no markup from outside is inserted. The picture is `role="img"` with a text alternative that points at the step's
 * details; when a step cannot be drawn it says why in words. All geometry is `src/render/mechanism/geometry` (pure).
 */
import { FIXED_SCALE_BOND_UNITS, LABEL_GLYPH_PX } from '@/chem/contracts';
import { FLOOR, SIZE_RULES } from '@/render/equation';
import { useEffect, useState, type ReactNode } from 'react';
import { composeStep, type CurvedArrow, type Placed, type Point } from './geometry';
import type { DrawableStep, StepDrawingPort } from './contracts';
import { NO_DRAWING_WORDS, NO_MOVEMENTS_WORDS } from './step-model';
import { useNearScreen, useStepDrawing, type Shown } from './use-step-drawing';
import styles from './step-drawing.module.css';

export type DrawingStatus = 'loading' | 'ready' | 'none' | 'engine';

export interface StepDrawingProps {
  readonly step: DrawableStep;
  readonly port: StepDrawingPort;
  /** `column`: before above, a down arrow, after below (a phone). */
  readonly orientation: 'row' | 'column';
  /** A long mechanism: draw only when the step is near the screen (D7). */
  readonly lazy?: boolean;
  /** Tells the parent whether there is a drawing (the step's details open when there is none). */
  readonly onStatus?: (status: DrawingStatus) => void;
}

const HEAD = 7;
/** The "+" in drawing units: the font that shows at the size of the structures' atom labels (a capital is 0.73 of the font). */
export const PLUS_FONT_UNITS = Math.round(((LABEL_GLYPH_PX / 0.73) * FIXED_SCALE_BOND_UNITS) / SIZE_RULES.mechanism.standard);

/** One reaction arrow: a line with a head, or the two half arrows of an equilibrium; `from` to `to`. */
function ReactionArrow(props: { readonly from: Point; readonly to: Point; readonly equilibrium: boolean }): ReactNode {
  const { from, to } = props;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const nx = -Math.sin(angle);
  const ny = Math.cos(angle);
  const barb = (tip: Point, direction: number, side: number): string => `M ${tip.x - HEAD * Math.cos(direction - side * 0.5)} ${tip.y - HEAD * Math.sin(direction - side * 0.5)} L ${tip.x} ${tip.y}`;
  const full = (tip: Point, direction: number): string => `${barb(tip, direction, 1)} M ${tip.x - HEAD * Math.cos(direction + 0.5)} ${tip.y - HEAD * Math.sin(direction + 0.5)} L ${tip.x} ${tip.y}`;
  if (!props.equilibrium) {
    return <path className={styles.reaction} data-reaction-arrow="forward" d={`M ${from.x} ${from.y} L ${to.x} ${to.y} ${full(to, angle)}`} />;
  }
  const a = { x: nx * 3, y: ny * 3 };
  return (
    <g data-reaction-arrow="equilibrium">
      <path className={styles.reaction} d={`M ${from.x + a.x} ${from.y + a.y} L ${to.x + a.x} ${to.y + a.y} ${barb({ x: to.x + a.x, y: to.y + a.y }, angle, 1)}`} />
      <path className={styles.reaction} d={`M ${to.x - a.x} ${to.y - a.y} L ${from.x - a.x} ${from.y - a.y} ${barb({ x: from.x - a.x, y: from.y - a.y }, angle + Math.PI, -1)}`} />
    </g>
  );
}

function Species(props: { readonly item: Placed; readonly shown: Shown }): ReactNode {
  const { item, shown } = props;
  const { drawn } = shown;
  const cx = item.x + item.width / 2;
  const cy = item.y + item.height / 2;
  return (
    <g data-species="">
      {drawn.kind === 'structure' && shown.url !== undefined ? <image href={shown.url} x={item.x} y={item.y} width={item.width} height={item.height} preserveAspectRatio="xMidYMid meet" /> : null}
      {drawn.kind === 'label' ? (
        <text className={styles.label} x={cx} y={cy}>
          {drawn.label}
        </text>
      ) : null}
      {item.bracket ? (
        <g data-bracket="">
          <path className={styles.bracket} d={`M ${item.x - 4} ${item.y - 10} L ${item.x - 10} ${item.y - 10} L ${item.x - 10} ${item.y + item.height + 10} L ${item.x - 4} ${item.y + item.height + 10}`} />
          <path className={styles.bracket} d={`M ${item.x + item.width + 4} ${item.y - 10} L ${item.x + item.width + 10} ${item.y - 10} L ${item.x + item.width + 10} ${item.y + item.height + 10} L ${item.x + item.width + 4} ${item.y + item.height + 10}`} />
          <text className={styles.dagger} x={item.x + item.width + 13} y={item.y - 4}>
            ‡
          </text>
        </g>
      ) : null}
    </g>
  );
}

function Arrow(props: { readonly arrow: CurvedArrow }): ReactNode {
  const { arrow } = props;
  const head = arrow.head;
  const [first, second] = head.wings;
  const headPath = first === undefined ? '' : `M ${first.x} ${first.y} L ${head.tip.x} ${head.tip.y}${second === undefined ? '' : ` L ${second.x} ${second.y}`}`;
  return (
    <g data-arrow="">
      <path className={styles.arrow} d={arrow.path} />
      <path className={styles.arrow} data-arrow-head={head.full ? 'full' : 'half'} d={headPath} />
      {arrow.dots.map((dot, i) => (
        <circle key={i} className={styles.dot} data-dot="" cx={dot.x} cy={dot.y} r={1.9} />
      ))}
    </g>
  );
}

export function StepDrawing(props: StepDrawingProps): ReactNode {
  const { step, port, orientation, onStatus } = props;
  const [attempt, setAttempt] = useState(0);
  const { ref, near } = useNearScreen(props.lazy === true);
  const state = useStepDrawing(step, port, near, attempt);
  const status: DrawingStatus = state.status === 'idle' || state.status === 'loading' ? 'loading' : state.status;
  useEffect(() => {
    onStatus?.(status);
  }, [status, onStatus]);

  if (state.status === 'idle' || state.status === 'loading') {
    return (
      <p className={styles.words} ref={ref}>
        {`Drawing step ${step.number}…`}
      </p>
    );
  }
  if (state.status === 'none') return <p className={styles.words}>{state.words}</p>;
  if (state.status === 'engine') {
    return (
      <p className={styles.words} role="alert">
        {NO_DRAWING_WORDS.engine}
        {port.retry === undefined ? null : (
          <button type="button" className={styles.retry} onClick={() => {
              port.retry?.();
              setAttempt((n) => n + 1);
            }}>
            Retry
          </button>
        )}
      </p>
    );
  }
  const composition = composeStep({ before: state.before.map((s) => s.drawn), after: state.after.map((s) => s.drawn), orientation, reversible: step.reversible, movements: step.electronMovements });
  if (!composition.ok) return <p className={styles.words}>{NO_DRAWING_WORDS.missingAtoms}</p>;
  const everyone: readonly Shown[] = [...state.before, ...state.after];
  // the one size rule (8.5d): the standard bond length when there is room, down to the floor, then the box scrolls sideways
  const standard = SIZE_RULES.mechanism.standard / FIXED_SCALE_BOND_UNITS;
  const natural = Math.round(composition.width);
  const widest = Math.round(natural * standard);
  return (
    <figure className={styles.drawing} data-step-drawing="" data-orientation={orientation}>
      <div className={styles.scroll} data-drawing-scroll="">
        <svg
          className={styles.svg}
          role="img"
          aria-label={`Drawing of step ${step.number}; the details are below.`}
          viewBox={`0 0 ${natural} ${Math.round(composition.height)}`}
          data-bond-px={SIZE_RULES.mechanism.standard}
          style={{ width: '100%', maxWidth: `${widest}px`, minWidth: `${Math.round(widest * FLOOR)}px` }}
        >
          {composition.items.map((item) => (
            <Species key={item.index} item={item} shown={everyone[item.index] as Shown} />
          ))}
          {composition.pluses.map((p, i) => (
            <text key={i} className={styles.plus} data-plus="" fontSize={PLUS_FONT_UNITS} x={p.x} y={p.y}>
              +
            </text>
          ))}
          <ReactionArrow from={composition.arrow.from} to={composition.arrow.to} equilibrium={composition.arrow.equilibrium} />
          {composition.arrows.map((arrow, i) => (
            <Arrow key={i} arrow={arrow} />
          ))}
        </svg>
      </div>
      {state.noMovements ? <p className={styles.quiet}>{NO_MOVEMENTS_WORDS}</p> : null}
    </figure>
  );
}
