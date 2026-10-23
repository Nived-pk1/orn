/**
 * The two bulk review actions where they are used (the queue page, the map's selection bar; step 6.8b R1 / R2): `markVerified(refs)` and
 * `needsReview(refs)` plus the dialogs to render. A choice with nothing to confirm is applied at once and said in a toast; one with an
 * error, a warning or an already-verified record opens the confirm step first. Each action is ONE envelope, so ONE Undo step. The model is
 * `core/editing/review-queue.ts`; nothing here knows what a finding means.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { markVerifiedEnvelope, needsReviewEnvelope, verifyPlan } from '@/core/editing';
import type { RecordRef } from '@/core/schema';
import { useToasts } from '@/ui/primitives';
import type { ReviewPort } from './contracts';
import { NeedsReviewDialog } from './needs-review-dialog';
import { VerifyDialog } from './verify-dialog';
import { pluralWords } from './words';

export interface BulkReview {
  markVerified(refs: readonly RecordRef[]): void;
  needsReview(refs: readonly RecordRef[]): void;
  readonly dialogs: ReactNode;
}

/** `onDone` runs after a change was made; `onCancel` when a dialog was closed without one (the map's host closes its own state on either). */
export function useBulkReview(port: ReviewPort, onDone?: () => void, onCancel?: () => void): BulkReview {
  const toasts = useToasts();
  const [verify, setVerify] = useState<readonly RecordRef[] | null>(null);
  const [needs, setNeeds] = useState<readonly RecordRef[] | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);

  const apply = useCallback(
    (refs: readonly RecordRef[]): boolean => {
      const built = markVerifiedEnvelope(port.state(), refs, port.findingsOf, port.now());
      if (!built.ok) {
        toasts.push({ kind: 'warning', text: built.message });
        return false;
      }
      const result = port.dispatch(built.envelope);
      if (!result.ok) {
        toasts.push({ kind: 'warning', text: `Nothing was marked verified: ${result.message}` });
        return false;
      }
      toasts.push({ kind: 'info', text: `Marked ${pluralWords(built.envelope.commands.length, 'record')} verified. Undo brings them back.` });
      onDone?.();
      return true;
    },
    [port, toasts, onDone],
  );

  const markVerified = useCallback(
    (refs: readonly RecordRef[]): void => {
      if (port.unavailable !== undefined) return void toasts.push({ kind: 'warning', text: port.unavailable });
      const plan = verifyPlan(port.state(), refs, port.findingsOf);
      if (plan.refused.length > 0 || plan.warned.length > 0 || plan.alreadyVerified.length > 0 || plan.ready.length === 0) setVerify(refs);
      else apply(plan.ready);
    },
    [port, toasts, apply],
  );
  const needsReview = useCallback((refs: readonly RecordRef[]): void => {
    setMessage(undefined);
    setNeeds(refs);
  }, []);

  const dialogs = (
    <>
      {verify === null ? null : (
        <VerifyDialog
          plan={verifyPlan(port.state(), verify, port.findingsOf)}
          unavailable={port.unavailable}
          onClose={() => {
            setVerify(null);
            onCancel?.();
          }}
          onConfirm={() => {
            const plan = verifyPlan(port.state(), verify, port.findingsOf);
            if (apply(plan.ready)) setVerify(null);
          }}
        />
      )}
      {needs === null ? null : (
        <NeedsReviewDialog
          count={needs.length}
          unavailable={port.unavailable}
          message={message}
          onClose={() => {
            setNeeds(null);
            onCancel?.();
          }}
          onConfirm={(reason) => {
            const built = needsReviewEnvelope(port.state(), needs, reason, port.now());
            if (!built.ok) return setMessage(built.message);
            const result = port.dispatch(built.envelope);
            if (!result.ok) return setMessage(`Nothing was changed: ${result.message}`);
            const n = built.envelope.commands.length;
            toasts.push({ kind: 'info', text: `${pluralWords(n, 'record')} now ${n === 1 ? 'needs' : 'need'} review. Undo brings the old state back.` });
            setNeeds(null);
            onDone?.();
          }}
        />
      )}
    </>
  );
  return { markVerified, needsReview, dialogs };
}
