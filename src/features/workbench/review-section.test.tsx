// @vitest-environment jsdom
/**
 * The editor's Review section (step 6.8b, R1): the same two actions as the queue, on the DRAFT. "Mark verified" sets the status to verified
 * and `reviewedAt` from the injected clock and keeps the reasons; it is refused while the draft has an ERROR (the first error in words) and
 * lists the warnings for a confirm; "Needs review" needs a one-line reason that is added to the reasons. The "arrives in step 6.8" words
 * are gone.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewContext, type ReviewActions } from './review-context';
import type { DraftRecipe } from '@/core/editing';
import { ReviewSection } from './species-sections';

afterEach(cleanup);

type Draft = { review: { lifecycle: string; status: string; reasons: string[]; reviewedAt?: string } };
const NOW = '2026-10-23T12:00:00.000Z';

function Harness(props: { readonly start?: Partial<Draft['review']>; readonly actions?: Partial<ReviewActions>; readonly onDraft?: (draft: Draft) => void; readonly unavailable?: string }) {
  const [draft, setDraft] = useState<Draft>({ review: { lifecycle: 'draft', status: 'unreviewed', reasons: [], ...props.start } });
  const apply = (recipe: DraftRecipe): void => {
    const next = JSON.parse(JSON.stringify(draft)) as Draft;
    recipe(next as unknown as Record<string, unknown>);
    setDraft(next);
    props.onDraft?.(next);
  };
  const actions: ReviewActions = { errors: [], warnings: [], now: () => NOW, ...props.actions };
  return (
    <ReviewContext.Provider value={actions}>
      <ReviewSection draft={draft} onEdit={apply} {...(props.unavailable === undefined ? {} : { unavailable: props.unavailable })} />
    </ReviewContext.Provider>
  );
}

describe('the Review section', () => {
  it('shows the status, the reasons and the two actions; the "arrives in step 6.8" words are gone', () => {
    render(<Harness start={{ status: 'review_required', reasons: ['Imported without a source'] }} />);
    expect(screen.getByText(/Review status:/).textContent).toContain('Needs review');
    expect(screen.getByText(/Imported without a source/)).toBeTruthy();
    expect(screen.queryByText(/step 6\.8/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark verified' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Needs review' })).toBeTruthy();
  });

  it('Mark verified sets verified, reviewedAt from the clock and keeps the reasons', () => {
    let last: Draft | undefined;
    render(<Harness start={{ status: 'review_required', reasons: ['Check the source'] }} onDraft={(draft) => (last = draft)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark verified' }));
    expect(last?.review).toMatchObject({ status: 'verified', reviewedAt: NOW, reasons: ['Check the source'] });
    expect(screen.getByText(/Review status:/).textContent).toContain('Verified');
  });

  it('an ERROR refuses it, in words, and nothing changes', () => {
    let last: Draft | undefined;
    render(<Harness actions={{ errors: ['Formula does not match the structure'] }} onDraft={(draft) => (last = draft)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark verified' }));
    expect(screen.getByRole('alert').textContent).toContain('Formula does not match the structure');
    expect(last).toBeUndefined();
  });

  it('warnings ask first: the confirm lists the count and the first warning, and nothing changes until Mark verified', () => {
    let last: Draft | undefined;
    render(<Harness actions={{ warnings: ['Charge looks odd', 'Second'] }} onDraft={(draft) => (last = draft)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark verified' }));
    const confirm = screen.getByRole('group', { name: 'Confirm marking verified' });
    expect(confirm.textContent).toContain('2 warnings');
    expect(confirm.textContent).toContain('Charge looks odd');
    expect(last).toBeUndefined();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Mark verified' }));
    expect(last?.review.status).toBe('verified');
  });

  it('Needs review needs a one-line reason, which is added to the reasons', () => {
    let last: Draft | undefined;
    render(<Harness start={{ status: 'verified', reasons: ['Old'] }} onDraft={(draft) => (last = draft)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Needs review' }));
    const ask = screen.getByRole('group', { name: 'Why does this need review?' });
    expect(within(ask).getByRole('button', { name: 'Needs review' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.change(within(ask).getByLabelText('Why does this need review? (one line)'), { target: { value: 'Source is missing' } });
    fireEvent.click(within(ask).getByRole('button', { name: 'Needs review' }));
    expect(last?.review).toMatchObject({ status: 'review_required', reasons: ['Old', 'Source is missing'] });
  });

  it('a read-only tab says why on both actions', () => {
    render(<Harness unavailable="This tab is read-only" />);
    expect(screen.getByRole('button', { name: 'Mark verified' }).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Needs review' }).getAttribute('aria-disabled')).toBe('true');
  });
});
