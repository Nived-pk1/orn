/**
 * The arrow of "Show full equation" (phone mode B, part 3, item a): a DRAWN arrow in the style of the card's arrow (a 1.5 px ink line and an
 * open head), as long as the longer of the texts over and under it, with both texts centred. No "→" character: the equation's accessible
 * name carries it. The caller gives the two texts as nodes (either may be empty); a minimum length keeps an arrow without text visible.
 */
import type { ReactNode } from 'react';
import styles from './equation-arrow.module.css';

export function EquationArrow(props: { readonly above?: ReactNode; readonly below?: ReactNode }) {
  return (
    <span className={styles.arrow} data-equation-arrow="">
      <span className={styles.text} data-equation-above="">
        {props.above}
      </span>
      <span className={styles.line} aria-hidden="true">
        <span className={styles.shaft} />
        <svg className={styles.head} width="9" height="10" viewBox="0 0 9 10" focusable="false">
          <path d="M1 1 L8 5 L1 9" />
        </svg>
      </span>
      <span className={`${styles.text} ${styles.below}`} data-equation-below="">
        {props.below}
      </span>
    </span>
  );
}
