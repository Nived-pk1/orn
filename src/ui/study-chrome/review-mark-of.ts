/**
 * The ONE function that decides the review mark from (edition, status) (step 8.4a, Part D). Study: nothing for verified, a quiet grey dot
 * "Not yet reviewed", a dot in the warning colour "Needs checking". Studio keeps its pill and its own words. Pure; no DOM.
 */
export type ReviewStatus = 'verified' | 'review_required' | 'unreviewed';
export type ReviewEdition = 'study' | 'studio';

export type ReviewMarkSpec =
  | { readonly kind: 'none' }
  | { readonly kind: 'dot'; readonly tone: 'quiet' | 'warning'; readonly label: string }
  | { readonly kind: 'pill'; readonly tone: 'review'; readonly label: string };

export function reviewMarkOf(edition: ReviewEdition, status: ReviewStatus): ReviewMarkSpec {
  if (status === 'verified') return { kind: 'none' };
  if (edition === 'studio') return { kind: 'pill', tone: 'review', label: status === 'review_required' ? 'Review required' : 'Not yet reviewed' };
  return status === 'review_required' ? { kind: 'dot', tone: 'warning', label: 'Needs checking' } : { kind: 'dot', tone: 'quiet', label: 'Not yet reviewed' };
}

/** The line under the title in the Study inspector for a record that needs checking. */
export const STUDY_REVIEW_SENTENCE = 'This has an open question. Check it with your textbook or teacher.';

/** The Study words of the Reactions "Review status" filter. */
export const REVIEW_FILTER_WORDS: Readonly<Record<ReviewStatus, string>> = {
  verified: 'Reviewed',
  unreviewed: 'Not yet reviewed',
  review_required: 'Needs checking',
};
