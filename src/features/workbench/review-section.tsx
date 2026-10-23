/**
 * The editor's Review section (step 6.8b, R1; used by every form): the lifecycle, the status in words, the reasons, and the same two actions
 * as the review queue, applied to the DRAFT (saved with Save, one Undo like any save). "Mark verified" sets verified and `reviewedAt` from
 * the injected clock and keeps the reasons; it is REFUSED while the draft has an ERROR finding (the first error in words) and asks first when
 * it has warnings. "Needs review" needs a one-line reason, added to the reasons. Nothing is verified by itself.
 */
import { useState } from 'react';
import type { DraftRecipe } from '@/core/editing';
import { Button } from '@/ui/primitives';
import { useReviewActions } from './review-context';
import type { SectionProps } from './section-props';
import { setLifecycle, speciesViewOf } from './species-model';
import styles from './editor.module.css';

const STATUS_WORDS: Readonly<Record<string, string>> = { unreviewed: 'Not reviewed', review_required: 'Needs review', verified: 'Verified' };
const MAX_REASONS = 32;

type Fields = Record<string, unknown>;
const reviewOf = (draft: Fields): Fields => (typeof draft.review === 'object' && draft.review !== null ? draft.review : (draft.review = {})) as Fields;

const markVerified = (now: string): DraftRecipe => (draft) => {
  const review = reviewOf(draft as Fields);
  review.status = 'verified';
  review.reviewedAt = now;
};
const needsReview = (reason: string): DraftRecipe => (draft) => {
  const review = reviewOf(draft as Fields);
  const reasons = Array.isArray(review.reasons) ? (review.reasons as string[]) : [];
  review.status = 'review_required';
  review.reasons = reasons.includes(reason) ? reasons : [...reasons, reason];
};

const plural = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`;

export function ReviewSection(props: SectionProps) {
  const view = speciesViewOf(props.draft);
  const actions = useReviewActions();
  const [asking, setAsking] = useState<'warnings' | 'reason' | null>(null);
  const [refusal, setRefusal] = useState<string | undefined>(undefined);
  const [reason, setReason] = useState('');
  const locked = props.unavailable;
  const errors = actions?.errors ?? [];
  const warnings = actions?.warnings ?? [];
  const reasons = ((props.draft as Fields).review as { reasons?: unknown } | undefined)?.reasons;
  const reasonList = Array.isArray(reasons) ? (reasons as string[]) : [];

  const verify = (): void => {
    setRefusal(undefined);
    const first = errors[0];
    if (first !== undefined) return setRefusal(`This record has an error and cannot be marked verified: ${first}`);
    if (actions === undefined || actions.now() === '') return setRefusal('The time is not available here, so the record cannot be stamped as verified.');
    if (warnings.length > 0 && asking !== 'warnings') return setAsking('warnings');
    props.onEdit(markVerified(actions.now()), 'review.status');
    setAsking(null);
  };
  const ask = (): void => {
    setRefusal(undefined);
    setAsking('reason');
  };
  const confirmNeeds = (): void => {
    const text = reason.trim();
    if (reasonList.length >= MAX_REASONS && !reasonList.includes(text)) return setRefusal(`This record already has ${MAX_REASONS} reasons: remove one first.`);
    props.onEdit(needsReview(text), 'review.status');
    setReason('');
    setAsking(null);
  };

  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="species-lifecycle">Lifecycle</label>
        <select id="species-lifecycle" value={view.lifecycle} disabled={locked !== undefined} aria-invalid={props.invalid?.has('review.lifecycle') === true ? true : undefined} data-field-path="review.lifecycle" onChange={(event) => props.onEdit(setLifecycle(event.target.value), 'review.lifecycle')}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
      <p>
        Review status: <strong>{STATUS_WORDS[view.status] ?? view.status}</strong>
      </p>
      {reasonList.length === 0 ? null : <p className={styles.hint}>{`Reasons: ${reasonList.join('; ')}`}</p>}
      <div className={styles.toolbar}>
        <Button {...(locked !== undefined ? { unavailable: locked } : { onClick: verify })}>Mark verified</Button>
        <Button {...(locked !== undefined ? { unavailable: locked } : { onClick: ask })}>Needs review</Button>
      </div>
      {refusal === undefined ? null : <p role="alert">{refusal}</p>}
      {asking !== 'warnings' ? null : (
        <div role="group" aria-label="Confirm marking verified" className={styles.field}>
          <p>{`This record has ${plural(warnings.length, 'warning')}; first: ${warnings[0] ?? ''}`}</p>
          <div className={styles.toolbar}>
            <Button variant="primary" onClick={verify}>
              Mark verified
            </Button>
            <Button onClick={() => setAsking(null)}>Cancel</Button>
          </div>
        </div>
      )}
      {asking !== 'reason' ? null : (
        <div role="group" aria-label="Why does this need review?" className={styles.field}>
          <label htmlFor="review-section-reason">Why does this need review? (one line)</label>
          <input id="review-section-reason" type="text" value={reason} autoComplete="off" onChange={(event) => setReason(event.target.value)} />
          <div className={styles.toolbar}>
            <Button variant="primary" {...(reason.trim() === '' || /[\r\n]/.test(reason) ? { unavailable: 'Say why this needs review, in one line' } : { onClick: confirmNeeds })}>
              Needs review
            </Button>
            <Button onClick={() => setAsking(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
