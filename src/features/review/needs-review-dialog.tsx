/**
 * "Needs review" (step 6.8b, R1): a REQUIRED one-line reason, added to the reasons of every chosen record. The button stays unavailable,
 * with the reason why, until a reason is typed. Text nodes only.
 */
import { useState } from 'react';
import { Button, Dialog } from '@/ui/primitives';
import styles from './review.module.css';

export interface NeedsReviewDialogProps {
  readonly count: number;
  readonly unavailable: string | undefined;
  /** The model's or the store's refusal, in words, after the last try. */
  readonly message?: string | undefined;
  readonly onConfirm: (reason: string) => void;
  readonly onClose: () => void;
}

export function NeedsReviewDialog(props: NeedsReviewDialogProps) {
  const [reason, setReason] = useState('');
  const off = props.unavailable ?? (reason.trim() === '' ? 'Say why this needs review' : undefined);
  const footer = (
    <div className={styles.footer}>
      <Button variant="primary" {...(off !== undefined ? { unavailable: off } : { onClick: () => props.onConfirm(reason) })}>
        {`Needs review (${props.count})`}
      </Button>
      <Button onClick={props.onClose}>Cancel</Button>
    </div>
  );
  return (
    <Dialog open onClose={props.onClose} title="Needs review" footer={footer}>
      <p>The reason is added to the reasons of each chosen record, which stays in the queue.</p>
      <div className={styles.reason}>
        <label htmlFor="review-reason">Why does this need review? (one line)</label>
        <input id="review-reason" type="text" value={reason} autoComplete="off" onChange={(event) => setReason(event.target.value)} />
      </div>
      {props.message === undefined ? null : <p role="alert">{props.message}</p>}
    </Dialog>
  );
}
