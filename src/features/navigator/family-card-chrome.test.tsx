// @vitest-environment jsdom
/** A reaction card for a student (step 8.3, C7 and C8): the quiet review dot instead of the pill, and no "exclusive" caption; Studio keeps both. */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { manualTimers } from '@/test-support/navigator-kit';
import { studyChrome, StudyChromeProvider } from '@/ui/study-chrome';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { FamilyCardView } from './family-card';

afterEach(cleanup);

const state = demoState();
const aldehydes = (familyStudy(contextOf(state), 'cls_alcohols') as FamilyStudy).reactionsOf.groups.find((g) => g.name === 'Aldehydes');
const base = aldehydes?.cards[0] as FamilyCard;
const withWord = (word: string | null, reviewStatus: FamilyCard['reviewStatus']): FamilyCard => ({
  ...base,
  reviewStatus,
  examples: [],
  groups: base.groups.map((group) => ({ ...group, outcomes: group.outcomes.map((outcome) => ({ ...outcome, word })) })),
});

function show(card: FamilyCard, edition: 'study' | 'studio') {
  const env: FamilyEnv = { describe: () => undefined, keyOf: () => undefined, manager: undefined, timers: manualTimers(), layout: 'desktop' };
  render(
    <StudyChromeProvider value={studyChrome(edition, { ownData: false })}>
      <FamilyEnvContext.Provider value={env}>
        <FamilyCardView card={card} selected={false} onSelect={() => undefined} onGoToGroup={() => undefined} />
      </FamilyEnvContext.Provider>
    </StudyChromeProvider>,
  );
  return screen.getAllByRole('article')[0] as HTMLElement;
}

describe('the review mark on a card', () => {
  it('Study, not reviewed: the grey dot with its label, never the words', () => {
    const article = show(withWord('major', 'unreviewed'), 'study');
    expect(within(article).getByRole('img', { name: 'Not yet reviewed' }).getAttribute('data-review-mark')).toBe('dot');
    expect(within(article).queryByText('Not yet reviewed')).toBeNull();
  });
  it('Study, reviewed: nothing', () => {
    const article = show(withWord('major', 'verified'), 'study');
    expect(article.querySelector('[data-review-mark]')).toBeNull();
  });
  it('Studio, not reviewed: the pill with the words', () => {
    const article = show(withWord('major', 'unreviewed'), 'studio');
    expect(within(article).getByText('Not yet reviewed').getAttribute('data-review-mark')).toBe('pill');
  });
});

describe('the outcome word on a card', () => {
  it('Study: "exclusive" is not written, "major" and "minor" are', () => {
    expect(within(show(withWord('exclusive', 'verified'), 'study')).queryByText('exclusive')).toBeNull();
    cleanup();
    expect(within(show(withWord('major', 'verified'), 'study')).getAllByText('major').length).toBeGreaterThan(0);
    cleanup();
    expect(within(show(withWord('minor', 'verified'), 'study')).getAllByText('minor').length).toBeGreaterThan(0);
  });
  it('Studio: "exclusive" stays', () => {
    expect(within(show(withWord('exclusive', 'verified'), 'studio')).getAllByText('exclusive').length).toBeGreaterThan(0);
  });
});
