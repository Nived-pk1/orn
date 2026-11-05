/**
 * What the arrows mean, in the map's line row (step 8.2b, B3): only the rows for what is drawn. Its own chunk: the first view draws no arrow.
 */
import type { LegendKey } from './legend';
import { ChipSample, LineSample } from './navigator-legend';
import styles from './navigator.module.css';

export function ArrowKey(props: { readonly keys: LegendKey }) {
  const { keys } = props;
  if (!keys.lines && !keys.chip && !keys.pair) return null;
  return (
    <ul className={styles.arrowKey} aria-label="What the arrows mean">
      {!keys.lines ? null : (
        <>
          <li className={styles.legendItem} data-key="makes">
            <LineSample dashed={false} />
            solid line in the family's colour: what the family makes
          </li>
          <li className={styles.legendItem} data-key="madeFrom">
            <LineSample dashed />
            dashed dark line: what the family is made from
          </li>
        </>
      )}
      {!keys.chip ? null : (
        <li className={styles.legendItem} data-key="chip">
          <ChipSample />
          number of reactions on this arrow
        </li>
      )}
      {!keys.pair ? null : (
        <li className={styles.legendItem} data-key="pair">
          <LineSample dashed={false} both />
          one line with a head at each end: reactions both ways, a number near each head
        </li>
      )}
    </ul>
  );
}
