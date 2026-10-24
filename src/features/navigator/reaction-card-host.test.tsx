// @vitest-environment jsdom
/**
 * The card of a WHOLE reaction drawn outside a family page (step 7.1b D3): the same FamilyCardView, its env made from the app-level ports,
 * and for a reaction that has no card the injected fallback is drawn with the reason in words.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { Reaction } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { NavigatorProvider } from './navigator-context';
import { ReactionCardHost } from './reaction-card-host';

afterEach(cleanup);

const state = demoState();
const reactions = Object.values(state.records.reaction) as Reaction[];

function show(reactionId: string, extra: { selected?: boolean; outside?: string } = {}) {
  const rig = navigatorRig(createCanonicalStore({ initial: state, validateInitial: false }));
  const onSelect = vi.fn();
  const fallback = vi.fn((reason: string) => <p>{`fallback: ${reason}`}</p>);
  render(
    <NavigatorProvider ports={rig.ports} active={false}>
      <ReactionCardHost reactionId={reactionId} selected={extra.selected === true} onSelect={onSelect} fallback={fallback} {...(extra.outside === undefined ? {} : { outside: extra.outside })} />
    </NavigatorProvider>,
  );
  return { onSelect, fallback };
}

describe('ReactionCardHost', () => {
  it('draws the card of a reaction: its name as a button, a click selects it', () => {
    const r = reactions.find((one) => one.name.includes('PCC')) as Reaction;
    const { onSelect } = show(r.id);
    const button = screen.getByRole('button', { name: r.name });
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith(r.id);
  });

  it('marks a reaction that is outside the exam scope with the words it is given', () => {
    const r = reactions[0] as Reaction;
    show(r.id, { outside: 'outside JEE Main' });
    expect(screen.getByText('outside JEE Main')).toBeTruthy();
  });

  it('a reaction with no card draws the fallback with the reason', () => {
    const rig = reactions.find((one) => !one.outcomes.some((o) => o.products.some((p) => p.role === 'main'))) as Reaction;
    const { fallback } = show(rig.id);
    expect(fallback).toHaveBeenCalledWith('No main product is marked, so this reaction has no card.');
    expect(screen.getByText('fallback: No main product is marked, so this reaction has no card.')).toBeTruthy();
  });
});
