/**
 * "Show full equation" on a card (step 5.9a review, follow-up b): a disclosure with the whole outcome as the study wrote it: every
 * reactant with its coefficient, a DRAWN arrow (as long as the longer of the texts over and under it) with its reagents and conditions,
 * every product with the card's own selectivity word. A species already written on the left is not repeated on the arrow (the core does it).
 */
import { useState } from 'react';
import type { FullEquation } from '@/core/graph';
import { EquationArrow } from '@/ui/primitives';
import { ArrowSide } from './family-text';
import styles from './family-page.module.css';

export function FullEquationView(props: { readonly equation: FullEquation }) {
  const [open, setOpen] = useState(false);
  const { reactants, products, arrow } = props.equation;
  return (
    <details className={styles.equation} onClick={(event) => event.stopPropagation()} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Show full equation</summary>
      {open ? (
        <p className={styles.equationLine} aria-label={`Full equation: ${props.equation.text}`}>
          <span>{reactants.length === 0 ? 'nothing listed' : reactants.map((t) => t.text).join(' + ')}</span>
          <EquationArrow above={arrow.above.length === 0 ? null : <ArrowSide parts={arrow.above} />} below={arrow.below.length === 0 ? null : <ArrowSide parts={arrow.below} />} />
          <span>{products.length === 0 ? 'nothing listed' : products.map((t) => t.text).join(' + ')}</span>
        </p>
      ) : null}
    </details>
  );
}
