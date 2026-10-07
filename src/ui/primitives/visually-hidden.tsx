import type { ReactNode } from 'react';
import styles from './visually-hidden.module.css';

/** Text for assistive technology only (a reason a control is unavailable, a live-region label). */
export function VisuallyHidden(props: { readonly children: ReactNode; readonly id?: string }) {
  return (
    <span className={styles.hidden} {...(props.id === undefined ? {} : { id: props.id })}>
      {props.children}
    </span>
  );
}
