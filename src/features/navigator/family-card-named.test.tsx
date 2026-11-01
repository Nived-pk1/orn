// @vitest-environment jsdom
/**
 * The named-reaction badge on a card (7.4 D): with a way to open the named reaction's page it is a button that opens it (and does not select
 * the reaction); without one it stays plain text, as before. Written first (seen red).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { manualTimers } from '@/test-support/navigator-kit';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { FamilyCardView } from './family-card';

afterEach(cleanup);

const state = demoState();
const aldehydes = (familyStudy(contextOf(state), 'cls_alcohols') as FamilyStudy).reactionsOf.groups.find((g) => g.name === 'Aldehydes');
const base = aldehydes?.cards[0] as FamilyCard;
const card: FamilyCard = { ...base, namedReactions: [{ id: 'nrx_aldol', name: 'Aldol reaction' }] as never };

function show(openNamed?: (id: string) => void, hideNamedId?: string) {
  const env: FamilyEnv = { describe: () => undefined, keyOf: () => undefined, manager: undefined, timers: manualTimers(), layout: 'desktop', ...(openNamed === undefined ? {} : { openNamed }) };
  const onSelect = vi.fn();
  render(
    <FamilyEnvContext.Provider value={env}>
      <FamilyCardView card={card} selected={false} onSelect={onSelect} onGoToGroup={() => undefined} {...(hideNamedId === undefined ? {} : { hideNamedId })} />
    </FamilyEnvContext.Provider>,
  );
  return { onSelect, article: screen.getAllByRole('article')[0] as HTMLElement };
}

describe('the named-reaction badge', () => {
  it('is a button that opens the named reaction\'s page when the app gives a way', () => {
    const open = vi.fn();
    const { article, onSelect } = show(open);
    fireEvent.click(within(article).getByRole('button', { name: 'Aldol reaction' }));
    expect(open).toHaveBeenCalledWith('nrx_aldol');
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('is left out when it points to the page the card is on, and other named reactions stay (7.6 A3)', () => {
    const { article } = show(vi.fn(), 'nrx_aldol');
    expect(within(article).queryByText('Aldol reaction')).toBeNull();
    cleanup();
    const other = show(vi.fn(), 'nrx_other');
    expect(within(other.article).getByRole('button', { name: 'Aldol reaction' })).toBeTruthy();
  });
  it('is plain text without one', () => {
    const { article } = show();
    expect(within(article).getByText('Aldol reaction')).toBeTruthy();
    expect(within(article).queryByRole('button', { name: 'Aldol reaction' })).toBeNull();
  });
});
