// @vitest-environment jsdom
/** The small scope chips on a card (step 8.3b, B2): an enrichment reaction says "Extra", a prerequisite says "Background"; neither is dimmed. */
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { manualTimers } from '@/test-support/navigator-kit';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { FamilyCardView } from './family-card';
import { scopeChipOf } from './scope-chip';

afterEach(cleanup);

const aldehydes = (familyStudy(contextOf(demoState()), 'cls_alcohols') as FamilyStudy).reactionsOf.groups.find((g) => g.name === 'Aldehydes');
const card = aldehydes?.cards[0] as FamilyCard;

function show(chip?: 'Extra' | 'Background') {
  const env: FamilyEnv = { describe: () => undefined, keyOf: () => undefined, manager: undefined, timers: manualTimers(), layout: 'desktop' };
  render(
    <FamilyEnvContext.Provider value={env}>
      <FamilyCardView card={card} selected={false} onSelect={() => undefined} onGoToGroup={() => undefined} {...(chip === undefined ? {} : { scopeChip: chip })} />
    </FamilyEnvContext.Provider>,
  );
  return screen.getAllByRole('article')[0] as HTMLElement;
}

describe('scopeChipOf', () => {
  it('enrichment is Extra, prerequisite is Background; the others have no chip', () => {
    expect(scopeChipOf('enrichment')).toBe('Extra');
    expect(scopeChipOf('prerequisite')).toBe('Background');
    for (const scope of ['official', 'outside', 'unmapped']) expect(scopeChipOf(scope)).toBeUndefined();
  });
});

describe('the card with a scope chip', () => {
  it('shows the chip and is not marked outside or dimmed', () => {
    const article = show('Extra');
    expect(within(article).getByText('Extra')).toBeTruthy();
    expect(article.hasAttribute('data-outside')).toBe(false);
    cleanup();
    expect(within(show('Background')).getByText('Background')).toBeTruthy();
  });
  it('no chip by default', () => {
    const article = show();
    expect(within(article).queryByText('Extra')).toBeNull();
    expect(within(article).queryByText('Background')).toBeNull();
  });
});
