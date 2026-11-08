/**
 * The ONE review mark (step 8.3, C7; step 8.4a, Part D): cards, the inspector, lists and pages all draw it through this component, and
 * `reviewMarkOf` decides what it is. Studio keeps the pill with its words. Study shows a small dot with the label and the tooltip. Text
 * nodes only; the meaning is in the accessible name, never in colour alone.
 */
import { useStudyChrome } from './study-chrome-context';
import { reviewMarkOf, type ReviewStatus } from './review-mark-of';
import styles from './review-mark.module.css';

export type { ReviewStatus } from './review-mark-of';

/** `status` undefined: not known yet, so no mark (never a wrong one that is corrected a moment later). */
export function ReviewMark(props: { readonly status: ReviewStatus | undefined }) {
  const chrome = useStudyChrome();
  if (props.status === undefined) return null;
  const mark = reviewMarkOf(chrome.reviewMark === 'dot' ? 'study' : 'studio', props.status);
  if (mark.kind === 'none') return null;
  if (mark.kind === 'dot') {
    return <span role="img" aria-label={mark.label} title={mark.label} className={`${styles.dot} ${mark.tone === 'warning' ? styles.warning : ''}`} data-review-mark="dot" data-tone={mark.tone} />;
  }
  return (
    <span className={styles.pill} data-review-mark="pill">
      {mark.label}
    </span>
  );
}
