// @vitest-environment jsdom
/**
 * Examples on the card (7.3a C1, C2, C5): a general reaction's card has a CLOSED "Examples (n)" disclosure with each example's name as
 * a link and its own scheme; an example whose general card is not in the list is a card of its own with "Example of <general>" (a link);
 * an outside example has the outside style inside the disclosure. Written first (seen red).
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { familyStudy, type FamilyCard, type FamilyStudy } from '@/core/graph';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { contextOf } from '@/test-support/graph-state';
import { manualTimers } from '@/test-support/navigator-kit';
import { FamilyEnvContext, type FamilyEnv } from './family-env';
import { FamilyCardView } from './family-card';

afterEach(cleanup);

const state: CanonicalState = demoState();
function env(): FamilyEnv {
  return {
    describe: (ref: RecordRef) => {
      const record = (state.records as unknown as Record<string, Record<string, { name?: string; names?: { canonical: string } } | undefined>>)[ref.kind]?.[ref.id];
      const name = record?.names?.canonical ?? record?.name;
      return name === undefined ? undefined : { name };
    },
    keyOf: () => undefined,
    manager: undefined,
    timers: manualTimers(),
    layout: 'desktop',
  };
}
const aldehydes = (familyStudy(contextOf(state), 'cls_alcohols') as FamilyStudy).reactionsOf.groups.find((g) => g.name === 'Aldehydes');
const general = aldehydes?.cards.find((c) => (c.examples ?? []).length > 0) as FamilyCard;

function show(card: FamilyCard, extra: Partial<Parameters<typeof FamilyCardView>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <FamilyEnvContext.Provider value={env()}>
      <FamilyCardView card={card} selected={false} onSelect={onSelect} onGoToGroup={() => undefined} {...extra} />
    </FamilyEnvContext.Provider>,
  );
  return { onSelect, article: screen.getAllByRole('article')[0] as HTMLElement };
}

describe('the general reaction\'s card', () => {
  it('has a closed "Examples (1)" disclosure, after "Show full equation"', () => {
    const { article } = show(general);
    const summaries = within(article).getAllByText(/^(Show full equation|Examples \(1\))$/).map((node) => node.textContent);
    expect(summaries.slice(0, 2)).toEqual(['Show full equation', 'Examples (1)']); // the example inside has its own "Show full equation" after
    expect((within(article).getByText('Examples (1)').closest('details') as HTMLDetailsElement).open).toBe(false);
  });

  it('opened, it lists the example\'s name as a link that selects it, with its own scheme', () => {
    const { article, onSelect } = show(general);
    const details = within(article).getByText('Examples (1)').closest('details') as HTMLDetailsElement;
    details.open = true;
    const link = within(details).getByRole('button', { name: 'Ethanol → ethanal (PCC)' });
    fireEvent.click(link);
    expect(onSelect).toHaveBeenCalledWith('rxn_ethanol-to-ethanal-pcc');
    expect(details.querySelector('[role="group"]')).not.toBeNull(); // the example's scheme
  });

  it('the outside style is inside the disclosure for an outside example', () => {
    const { article } = show(general, { outsideOf: (id) => (id === 'rxn_ethanol-to-ethanal-pcc' ? 'outside JEE Main' : undefined) });
    const details = within(article).getByText('Examples (1)').closest('details') as HTMLDetailsElement;
    expect(within(details).getByText('outside JEE Main')).toBeTruthy();
    expect(details.querySelector('[data-outside]')).not.toBeNull();
  });
});

describe('an example that is its own card (C2)', () => {
  const example = { ...general.examples?.[0], exampleOf: { reactionId: general.reactionId, name: general.name } } as FamilyCard;

  it('says "Example of <general>" with a link that selects the general reaction', () => {
    const { article, onSelect } = show(example);
    const line = within(article).getByText(/^Example of/);
    fireEvent.click(within(line.parentElement as HTMLElement).getByRole('button', { name: general.name }));
    expect(onSelect).toHaveBeenCalledWith(general.reactionId);
  });

  it('a card with no link to a general reaction says nothing of the kind and has no disclosure', () => {
    const plain = aldehydes?.cards.find((c) => (c.examples ?? []).length === 0) as FamilyCard;
    const { article } = show(plain);
    expect(within(article).queryByText(/^Example of/)).toBeNull();
    expect(within(article).queryByText(/^Examples \(/)).toBeNull();
  });
});
