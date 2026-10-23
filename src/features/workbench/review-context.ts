/**
 * What the editor's Review section needs of the draft's findings and the clock (step 6.8b, R1), provided by the editor host so a section
 * deep in a form can offer "Mark verified" and "Needs review" without the form knowing the window. Absent (a unit test without it, a
 * nested editor): no findings, and the time is the empty string, which the section refuses to stamp.
 */
import { createContext, useContext } from 'react';

export interface ReviewActions {
  /** The messages of the draft's ERROR findings, first first. */
  readonly errors: readonly string[];
  /** The messages of the draft's WARNING findings, first first. */
  readonly warnings: readonly string[];
  /** The injected clock as an ISO time. */
  now(): string;
}

export const ReviewContext = createContext<ReviewActions | undefined>(undefined);
export const useReviewActions = (): ReviewActions | undefined => useContext(ReviewContext);

/** The draft's findings split by severity (not memoised by the host: it sits after early returns, and the section it feeds is cheap). */
export const reviewActionsOf = (findings: readonly { readonly severity: string; readonly message: string }[], now: (() => string) | undefined): ReviewActions => ({
  errors: findings.filter((one) => one.severity === 'error').map((one) => one.message),
  warnings: findings.filter((one) => one.severity === 'warning').map((one) => one.message),
  now: () => now?.() ?? '',
});
