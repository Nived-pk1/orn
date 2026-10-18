/**
 * The phone's arrow of the textbook equation (equation step, part 6): a downward arrow centred under the reactants, at least 48 px tall,
 * with the reagents to its right and the conditions under them (as the phone card's own down arrow). A reaction stored as an equilibrium
 * gets two half arrows side by side, one down and one up. The line is decoration (`aria-hidden`).
 */
import type { ArrowText } from '@/core/graph';
import { partsToRuns } from '@/render/scene';
import { Runs } from './runs';
import styles from './equation-scheme.module.css';

// a half head has one barb only: the down arrow's at its foot, the up arrow's at its top
const HEAD_DOWN = 'M2 1 L7 8 L12 1';
const HALF_DOWN = 'M2 1 L7 8';
const HALF_UP = 'M2 8 L7 1';

function Head(props: { readonly path: string }) {
  return (
    <svg className={styles.downHead} width="14" height="9" viewBox="0 0 14 9" focusable="false">
      <path d={props.path} />
    </svg>
  );
}

const Shaft = (props: { readonly path: string; readonly up?: boolean }) => (
  <span className={styles.downShaft}>
    {props.up === true ? <Head path={props.path} /> : null}
    <span className={styles.downStem} />
    {props.up === true ? null : <Head path={props.path} />}
  </span>
);

export function SchemeDownArrow(props: { readonly arrow: ArrowText; readonly equilibrium: boolean }) {
  const { above, below } = props.arrow;
  return (
    <div className={styles.downArrow} data-equation-arrow="" data-direction="down" data-equilibrium={props.equilibrium ? '' : undefined}>
      <div className={styles.downLine} data-equation-line="" aria-hidden="true">
        {props.equilibrium ? (
          <>
            <Shaft path={HALF_DOWN} />
            <Shaft path={HALF_UP} up />
          </>
        ) : (
          <Shaft path={HEAD_DOWN} />
        )}
      </div>
      <div className={styles.downText} data-equation-text="">
        <div data-equation-above="">{above.length === 0 ? null : <Runs runs={partsToRuns(above)} />}</div>
        <div className={styles.downBelow} data-equation-below="">
          {below.length === 0 ? null : <Runs runs={partsToRuns(below)} />}
        </div>
      </div>
    </div>
  );
}
