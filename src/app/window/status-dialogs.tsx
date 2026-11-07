/** The status bar's two dialogs (step 8.4a): every status item in full words, and the layout notes. A lazy chunk, loaded on first open. */
import { Dialog } from '@/ui/primitives';
import styles from './full-status.module.css';

export interface StatusDialogsProps {
  readonly kind: 'all' | 'layout';
  readonly items: readonly string[];
  readonly layoutNotice: string | null;
  readonly onClose: () => void;
}

export function StatusDialogs(props: StatusDialogsProps) {
  if (props.kind === 'layout') {
    return (
      <Dialog open onClose={props.onClose} title="Layout notes" dismissOnBackdrop>
        <p>{props.layoutNotice}</p>
      </Dialog>
    );
  }
  return (
    <Dialog open onClose={props.onClose} title="Status" dismissOnBackdrop>
      <ul className={styles.detailList}>
        {props.items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </Dialog>
  );
}
