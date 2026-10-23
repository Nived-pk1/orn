/** One compact row of the review queue (step 6.8b, R1): checkbox, name, kind and status words, reasons, finding counts and the row's actions. */
import type { QueueRow } from '@/core/editing';
import { Button } from '@/ui/primitives';
import styles from './review.module.css';
import { pluralWords } from './words';

export interface ReviewRowProps {
  readonly row: QueueRow;
  readonly checked: boolean;
  readonly unavailable: string | undefined;
  /** Why "Edit" is unavailable for this kind; undefined when it opens an editor. */
  readonly editReason: string | undefined;
  readonly onCheck: (on: boolean, range: boolean) => void;
  readonly onOpen: () => void;
  readonly onEdit: () => void;
  readonly onVerify: () => void;
  readonly onNeeds: () => void;
}

export function ReviewRow(props: ReviewRowProps) {
  const { row } = props;
  const counts = [row.errors > 0 ? pluralWords(row.errors, 'error') : undefined, row.warnings > 0 ? pluralWords(row.warnings, 'warning') : undefined].filter((one) => one !== undefined).join(', ');
  return (
    <div className={styles.row}>
      <input
        type="checkbox"
        aria-label={`Select ${row.name}`}
        checked={props.checked}
        onChange={() => undefined}
        onClick={(event) => props.onCheck(event.currentTarget.checked, event.shiftKey)}
      />
      <div className={styles.rowMain}>
        <div className={styles.rowName}>{row.name}</div>
        <div className={styles.rowMeta}>{`${row.kindWords} · ${row.statusWords}${counts === '' ? '' : ` · ${counts}`}`}</div>
        {row.reasons.length === 0 ? null : <div className={styles.rowMeta}>{`Reasons: ${row.reasons.join('; ')}`}</div>}
        {row.firstError === undefined ? null : <div className={styles.rowMeta}>{`First error: ${row.firstError}`}</div>}
      </div>
      <div className={styles.rowActions}>
        <Button aria-label={`Open ${row.name} in the inspector`} onClick={props.onOpen}>
          Open in the inspector
        </Button>
        <Button aria-label={`Edit ${row.name}`} {...(props.editReason !== undefined ? { unavailable: props.editReason } : props.unavailable !== undefined ? { unavailable: props.unavailable } : { onClick: props.onEdit })}>
          Edit
        </Button>
        <Button aria-label={`Mark ${row.name} verified`} {...(props.unavailable !== undefined ? { unavailable: props.unavailable } : { onClick: props.onVerify })}>
          Mark verified
        </Button>
        <Button aria-label={`Mark ${row.name} as needing review`} {...(props.unavailable !== undefined ? { unavailable: props.unavailable } : { onClick: props.onNeeds })}>
          Needs review
        </Button>
      </div>
    </div>
  );
}
