/**
 * The arrow of the textbook equation: the reagents ABOVE it and the conditions BELOW (stage numbers as the card's arrow writes them), the
 * line on the middle line of the row. It grows with its text and is never shorter than 64 px. A reaction stored as an equilibrium gets the
 * equilibrium arrow (two half arrows); every other reaction gets one arrow. The line is decoration (`aria-hidden`): the equation's own
 * description carries the words.
 */
import type { ArrowText } from '@/core/graph';
import { partsToRuns } from '@/render/scene';
import { Runs } from './runs';
import styles from './equation-scheme.module.css';

const HEAD_FORWARD = 'M1 1 L8 5 L1 9';
// a half head: one barb only, up for the forward arrow and down for the back arrow
const HALF_FORWARD = 'M1 1 L8 5';
const HALF_BACK = 'M8 9 L1 5';

export function SchemeArrow(props: { readonly arrow: ArrowText; readonly equilibrium: boolean }) {
  const { above, below } = props.arrow;
  return (
    <div className={styles.arrow} data-equation-arrow="" data-equilibrium={props.equilibrium ? '' : undefined}>
      <div className={styles.above} data-equation-above="">
        {above.length === 0 ? null : <Runs runs={partsToRuns(above)} />}
      </div>
      {props.equilibrium ? (
        <div className={styles.equilibrium} aria-hidden="true">
          <span className={styles.line}>
            <span className={styles.shaft} />
            <svg className={styles.head} width="9" height="10" viewBox="0 0 9 10" focusable="false">
              <path d={HALF_FORWARD} />
            </svg>
          </span>
          <span className={styles.line}>
            <svg className={styles.head} width="9" height="10" viewBox="0 0 9 10" focusable="false">
              <path d={HALF_BACK} />
            </svg>
            <span className={styles.shaft} />
          </span>
        </div>
      ) : (
        <div className={styles.line} aria-hidden="true">
          <span className={styles.shaft} />
          <svg className={styles.head} width="9" height="10" viewBox="0 0 9 10" focusable="false">
            <path d={HEAD_FORWARD} />
          </svg>
        </div>
      )}
      <div className={styles.below} data-equation-below="">
        {below.length === 0 ? null : <Runs runs={partsToRuns(below)} />}
      </div>
    </div>
  );
}
