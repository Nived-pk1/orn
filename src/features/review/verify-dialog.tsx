/**
 * The confirm step of "Mark verified" (step 6.8b, R1): it opens when the choice holds a record with an ERROR (refused, listed with its first
 * error), a record with WARNINGs (listed with its count and first warning) or one that is already verified (skipped, counted). Nothing
 * changes until "Mark verified (n)"; the records with an error are never verified. Text nodes only.
 */
import type { VerifyPlan } from '@/core/editing';
import { Button, Dialog } from '@/ui/primitives';
import styles from './review.module.css';
import { pluralWords } from './words';

export interface VerifyDialogProps {
  readonly plan: VerifyPlan;
  /** Why nothing can change in this tab (read-only); undefined when it can. */
  readonly unavailable: string | undefined;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export function VerifyDialog(props: VerifyDialogProps) {
  const { plan } = props;
  const count = plan.ready.length;
  const off = props.unavailable ?? (count === 0 ? 'No chosen record can be marked verified' : undefined);
  const footer = (
    <div className={styles.footer}>
      <Button variant="primary" {...(off !== undefined ? { unavailable: off } : { onClick: props.onConfirm })}>
        {`Mark verified (${count})`}
      </Button>
      <Button onClick={props.onClose}>Cancel</Button>
    </div>
  );
  return (
    <Dialog open onClose={props.onClose} title="Mark verified" size="wide" footer={footer}>
      <p>Nothing changes until you press Mark verified. One Undo takes the whole step back.</p>
      {plan.refused.length === 0 ? null : (
        <>
          <h3>Not verified: these have an error</h3>
          <ul aria-label="Not verified: these have an error" className={styles.list}>
            {plan.refused.map((one) => (
              <li key={`${one.ref.kind}:${one.ref.id}`}>{`${one.name}: ${one.message}`}</li>
            ))}
          </ul>
        </>
      )}
      {plan.warned.length === 0 ? null : (
        <>
          <h3>Verified with warnings</h3>
          <ul aria-label="Verified with warnings" className={styles.list}>
            {plan.warned.map((one) => (
              <li key={`${one.ref.kind}:${one.ref.id}`}>{`${one.name}: ${pluralWords(one.count, 'warning')}, first: ${one.first}`}</li>
            ))}
          </ul>
        </>
      )}
      {plan.alreadyVerified.length === 0 ? null : <p>{`${pluralWords(plan.alreadyVerified.length, 'chosen record is', 'chosen records are')} already verified and stay as they are.`}</p>}
    </Dialog>
  );
}
