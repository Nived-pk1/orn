/**
 * "Show full equation" on a card (step 5.9a review, follow-up b): a disclosure with the whole outcome as the study wrote it: every
 * reactant with its coefficient, the arrow with its reagents and conditions, every product with its role in words. Text only.
 */
import { useState } from 'react';
import type { FullEquation } from '@/core/graph';
import { ArrowSide } from './family-text';
import styles from './family-page.module.css';

export function FullEquationView(props: { readonly equation: FullEquation }) {
  const [open, setOpen] = useState(false);
  const { reactants, products, arrow } = props.equation;
  const over = arrow.above.length > 0 || arrow.below.length > 0;
  return (
    <details className={styles.equation} onClick={(event) => event.stopPropagation()} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Show full equation</summary>
      {open ? (
        <p className={styles.equationLine} aria-label={`Full equation: ${props.equation.text}`}>
          <span>{reactants.length === 0 ? 'nothing listed' : reactants.map((t) => t.text).join(' + ')}</span>
          <span className={styles.equationArrow}>
            {over ? (
              <>
                <span data-equation-above="">{arrow.above.length === 0 ? null : <ArrowSide parts={arrow.above} />}</span>
                <span aria-hidden="true">→</span>
                <span data-equation-below="">{arrow.below.length === 0 ? null : <ArrowSide parts={arrow.below} />}</span>
              </>
            ) : (
              <span aria-hidden="true">→</span>
            )}
          </span>
          <span>{products.length === 0 ? 'nothing listed' : products.map((t) => t.text).join(' + ')}</span>
        </p>
      ) : null}
    </details>
  );
}
