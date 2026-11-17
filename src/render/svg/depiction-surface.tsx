/** The one wrapper every equation drawing sits in (step 8.4m2, B2): paper behind the drawing in dark, nothing in light. Arrows and condition text stay outside it. */
import type { ReactNode } from 'react';
import styles from './depiction-surface.module.css';

export function DepictionSurface(props: { readonly children: ReactNode }) {
  return (
    <span className={styles.surface} data-depiction-surface="">
      {props.children}
    </span>
  );
}
