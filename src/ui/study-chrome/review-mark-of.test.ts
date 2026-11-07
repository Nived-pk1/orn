/** One function decides the review mark from (edition, status) (step 8.4a, Part D): all six combinations. */
import { describe, expect, it } from 'vitest';
import { reviewMarkOf, REVIEW_FILTER_WORDS, STUDY_REVIEW_SENTENCE } from './review-mark-of';

describe('reviewMarkOf', () => {
  it('Study, verified: no mark', () => expect(reviewMarkOf('study', 'verified')).toEqual({ kind: 'none' }));
  it('Study, unreviewed: a grey dot, "Not yet reviewed"', () =>
    expect(reviewMarkOf('study', 'unreviewed')).toEqual({ kind: 'dot', tone: 'quiet', label: 'Not yet reviewed' }));
  it('Study, review_required: a dot in the warning colour, "Needs checking"', () =>
    expect(reviewMarkOf('study', 'review_required')).toEqual({ kind: 'dot', tone: 'warning', label: 'Needs checking' }));
  it('Studio, verified: no mark', () => expect(reviewMarkOf('studio', 'verified')).toEqual({ kind: 'none' }));
  it('Studio, unreviewed: the pill and its words', () =>
    expect(reviewMarkOf('studio', 'unreviewed')).toEqual({ kind: 'pill', tone: 'review', label: 'Not yet reviewed' }));
  it('Studio, review_required: the pill and its words', () =>
    expect(reviewMarkOf('studio', 'review_required')).toEqual({ kind: 'pill', tone: 'review', label: 'Review required' }));
  it('the inspector line and the Reactions filter use the Study words', () => {
    expect(STUDY_REVIEW_SENTENCE).toBe('This has an open question. Check it with your textbook or teacher.');
    expect(REVIEW_FILTER_WORDS).toEqual({ verified: 'Reviewed', unreviewed: 'Not yet reviewed', review_required: 'Needs checking' });
  });
});
