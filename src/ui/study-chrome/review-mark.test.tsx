// @vitest-environment jsdom
/** The one review mark (step 8.3, C7): Studio keeps the pill; Study shows a small quiet dot for a record that is not reviewed, nothing for a reviewed one. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReviewMark } from './review-mark';
import { StudyChromeProvider } from './study-chrome-context';
import { studyChrome } from './study-chrome';

afterEach(cleanup);

const inStudy = (status: 'verified' | 'review_required' | 'unreviewed') =>
  render(
    <StudyChromeProvider value={studyChrome('study', { ownData: false })}>
      <ReviewMark status={status} />
    </StudyChromeProvider>,
  );

describe('ReviewMark', () => {
  it('Study, not reviewed: a small dot with the accessible label and the tooltip "Not yet reviewed", and no words drawn', () => {
    const { container } = inStudy('unreviewed');
    const dot = screen.getByRole('img', { name: 'Not yet reviewed' });
    expect(dot.getAttribute('title')).toBe('Not yet reviewed');
    expect(dot.getAttribute('data-review-mark')).toBe('dot');
    expect(container.textContent).toBe('');
  });
  it('Study, reviewed: nothing at all', () => {
    const { container } = inStudy('verified');
    expect(container.firstChild).toBeNull();
  });
  it('Study, review required: the same quiet dot, labelled in its own words (never the pill)', () => {
    const { container } = inStudy('review_required');
    expect(screen.getByRole('img', { name: 'Needs checking' }).getAttribute('data-review-mark')).toBe('dot');
    expect(container.querySelector('[data-review-mark="pill"]')).toBeNull();
  });
  it('Studio (and a bare render, which is Studio): the pill with the words', () => {
    const { container } = render(<ReviewMark status="unreviewed" />);
    const pill = container.querySelector('[data-review-mark="pill"]');
    expect(pill?.textContent).toBe('Not yet reviewed');
    cleanup();
    expect(render(<ReviewMark status="verified" />).container.firstChild).toBeNull();
  });
});

describe('the status is known before a mark is drawn (step 8.4d, E1)', () => {
  it('an unknown status draws NO mark in either edition (never a "Not yet reviewed" flash)', () => {
    const { container } = render(
      <StudyChromeProvider value={studyChrome('study', { ownData: false })}>
        <ReviewMark status={undefined} />
      </StudyChromeProvider>,
    );
    expect(container.firstChild).toBeNull();
    const studio = render(
      <StudyChromeProvider value={studyChrome('studio', { ownData: false })}>
        <ReviewMark status={undefined} />
      </StudyChromeProvider>,
    );
    expect(studio.container.firstChild).toBeNull();
  });
});
