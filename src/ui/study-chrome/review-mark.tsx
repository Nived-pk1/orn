/**
 * The ONE review mark (step 8.3, C7): cards, the inspector, lists and pages all draw it through this component. Studio keeps the pill with
 * its words. Study shows a small quiet grey dot with the label and the tooltip, only for a record that is not reviewed; a reviewed record
 * shows nothing. Text nodes only; the meaning is in the accessible name, never in colour alone.
 */
import { useStudyChrome } from './study-chrome-context';
import styles from './review-mark.module.css';

export type ReviewStatus = 'verified' | 'review_required' | 'unreviewed';

const WORDS: Readonly<Record<ReviewStatus, string | undefined>> = {
  verified: undefined,
  review_required: 'Review required',
  unreviewed: 'Not yet reviewed',
};

export function ReviewMark(props: { readonly status: ReviewStatus }) {
  const chrome = useStudyChrome();
  const words = WORDS[props.status];
  if (words === undefined) return null;
  if (chrome.reviewMark === 'dot') return <span role="img" aria-label={words} title={words} className={styles.dot} data-review-mark="dot" />;
  return (
    <span className={styles.pill} data-review-mark="pill">
      {words}
    </span>
  );
}
