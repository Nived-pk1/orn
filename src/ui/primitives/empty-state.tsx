import type { ReactNode } from 'react';
import { Button } from './button';
import styles from './empty-state.module.css';

/**
 * An empty list or page (step 8.4f, D3): ONE sentence in plain words and at most one quiet button. The caller says it in the reader's
 * words (Study for students, Studio for authors). `inline` is the small form inside a panel; the default stands in the middle of an area.
 */
export function EmptyState(props: { readonly children: ReactNode; readonly action?: { readonly label: string; readonly onClick: () => void }; readonly inline?: boolean; readonly role?: 'status' }) {
  return (
    <div className={styles.empty} data-empty-state="" {...(props.inline === true ? { 'data-inline': '' } : {})} {...(props.role === undefined ? {} : { role: props.role })}>
      <p className={styles.sentence}>{props.children}</p>
      {props.action === undefined ? null : (
        <Button variant="quiet" onClick={props.action.onClick}>
          {props.action.label}
        </Button>
      )}
    </div>
  );
}
