/**
 * The dialogs of the map's bulk actions (step 6.8b, R2), a lazy chunk: "Mark verified (n)" runs the review queue's own path (the same
 * model, refusals and confirm; a clean choice is applied at once and said in a toast) and "Delete (n)" shows ONE aggregated impact dialog
 * (the 6.8a delete view over all the records; whatever blocks is listed) and deletes in ONE step. No chemistry.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { RecordRef } from '@/core/schema';
import { useBulkReview } from '@/features/review/layer';
import { useApp } from './context';
import { DeleteHost } from './delete-host';
import { useEditors } from './drafts-ui';
import { createReviewPort } from './review-host';

function VerifyReactions(props: { readonly refs: readonly RecordRef[]; readonly onClose: () => void }) {
  const { services, nowMs } = useApp();
  const editors = useEditors();
  const port = useMemo(() => createReviewPort({ store: services.store, nowMs, editors, open: () => undefined }), [services, nowMs, editors]);
  const bulk = useBulkReview(port, props.onClose, props.onClose);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    bulk.markVerified(props.refs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the host opens it (a double effect run in development must not apply twice)
  }, []);
  return <>{bulk.dialogs}</>;
}

export function MapBulkDialogs(props: { readonly action: 'verify' | 'delete'; readonly refs: readonly RecordRef[]; readonly reason: string | undefined; readonly onClose: () => void }) {
  return props.action === 'verify' ? <VerifyReactions refs={props.refs} onClose={props.onClose} /> : <DeleteHost targets={props.refs} reason={props.reason} onClose={props.onClose} />;
}
