/**
 * The small key INSIDE the map (step 8.3b, A3; a lazy chunk): only the marks of what is drawn, in two lines at most (solid = makes, dashed =
 * made from, chip = count, two-way line). The full sentences are in the Key popover.
 */
import type { LegendKey } from './legend';
import { ChipSample, LineSample } from './navigator-legend';
import styles from './map-float.module.css';

export function ArrowKey(props: { readonly keys: LegendKey }) {
  const { keys } = props;
  if (!keys.lines && !keys.chip && !keys.pair) return null;
  return (
    <ul className={styles.arrowKey} aria-label="What the arrows mean" data-arrow-key="">
      {!keys.lines ? null : (
        <>
          <li data-key="makes">
            <LineSample dashed={false} />
            makes
          </li>
          <li data-key="madeFrom">
            <LineSample dashed />
            made from
          </li>
        </>
      )}
      {!keys.chip ? null : (
        <li data-key="chip">
          <ChipSample />
          number of reactions
        </li>
      )}
      {!keys.pair ? null : (
        <li data-key="pair">
          <LineSample dashed={false} both />
          both ways
        </li>
      )}
    </ul>
  );
}
