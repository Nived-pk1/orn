/**
 * "Show full equation" on a card (equation step, part 5; before: step 5.9a review, follow-up b): a disclosure with the whole outcome drawn
 * as a textbook scheme (`render/equation`): every reactant with its coefficient, an arrow with the reagents over it and the conditions
 * under it, every product with the card's own selectivity word. A species already written on the left is not repeated on the arrow (the
 * core does it). Which terms are drawn and which are formulas is decided by the core from the chem facts; this only passes the page's ports.
 */
import { useContext, useState, useSyncExternalStore } from 'react';
import type { FullEquation } from '@/core/graph';
import { EquationScheme } from '@/render/equation';
import { FamilyEnvContext } from './family-env';
import styles from './family-page.module.css';

const never = (): (() => void) => () => undefined;

export function FullEquationView(props: { readonly equation: FullEquation }) {
  const [open, setOpen] = useState(false);
  const env = useContext(FamilyEnvContext);
  const structures = env?.equation?.structures;
  const names = useSyncExternalStore(structures === undefined ? never : structures.subscribe, structures === undefined ? () => true : structures.equationNames);
  return (
    <details className={styles.equation} onClick={(event) => event.stopPropagation()} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Show full equation</summary>
      {open ? (
        <EquationScheme
          equation={props.equation}
          binding={env?.equation?.binding}
          timers={env?.timers ?? { after: () => () => undefined }}
          facts={env?.equation?.facts}
          names={names}
          {...(structures === undefined ? {} : { onNamesChange: structures.setEquationNames })}
        />
      ) : null}
    </details>
  );
}
