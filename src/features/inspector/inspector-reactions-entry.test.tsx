// @vitest-environment jsdom
/**
 * The inspector's entry points into Reactions (step 7.1b E3, ADR-042 E7): "Show its reactions" on a species, class, reagent and named
 * reaction (both editions, so no editing port is needed), and on an arrow of several reactions "Open these <n> reactions in Reactions".
 * The inspector only tells its host; it knows no other feature.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { Inspector } from './inspector';

afterEach(cleanup);
beforeAll(fakeLayout);
beforeAll(preloadViews);

const state = demoState();
const first = (kind: 'species' | 'class' | 'reagent' | 'named_reaction' | 'concept'): RecordRef => ({ kind, id: Object.keys(state.records[kind])[0] as string }) as RecordRef;

function show(ref: RecordRef, withHost = true) {
  const rig = inspectorRig(state);
  const showReactions = vi.fn();
  const showArrowReactions = vi.fn();
  const host = withHost ? { ...rig.host, showReactions, showArrowReactions } : rig.host;
  render(<Inspector ports={rig.ports} host={host} />);
  act(() => rig.inspector.getState().open(ref));
  return { rig, showReactions, showArrowReactions };
}

describe('Show its reactions', () => {
  it.each(['species', 'class', 'reagent', 'named_reaction'] as const)('a %s has the button; it asks the host to show its reactions', (kind) => {
    const ref = first(kind);
    const { showReactions } = show(ref);
    fireEvent.click(screen.getByRole('button', { name: 'Show its reactions' }));
    expect(showReactions).toHaveBeenCalledWith(ref);
  });

  it('a concept has none', () => {
    show(first('concept'));
    expect(screen.queryByRole('button', { name: 'Show its reactions' })).toBeNull();
  });

  it('a host without the port draws no button', () => {
    show(first('species'), false);
    expect(screen.queryByRole('button', { name: 'Show its reactions' })).toBeNull();
  });
});

describe('an arrow of several reactions', () => {
  it('"Open these <n> reactions in Reactions" gives the host the arrow\'s two families', () => {
    const rig = inspectorRig(state);
    const pair = rig.ports.indexes
      .current()
      .navigatorRollup()
      .pairs()
      .find((one) => new Set(one.candidates.map((c) => c.reactionId)).size >= 2);
    if (pair === undefined) throw new Error('the demo has an arrow of several reactions');
    const showArrowReactions = vi.fn();
    const host = { ...rig.host, showArrowReactions, edgeEnds: () => ({ from: pair.from, to: pair.to }) };
    render(<Inspector ports={rig.ports} host={host} />);
    act(() => {
      rig.ports.ui.selection.getState().select({ kind: 'edge', id: 'e1' });
      rig.ports.ui.selection.getState().reveal();
    });
    const n = new Set(pair.candidates.map((c) => c.reactionId)).size;
    const region = screen.getByRole('region', { name: 'Reactions on this arrow' });
    fireEvent.click(within(region).getByRole('button', { name: `Open these ${n} reactions in Reactions` }));
    expect(showArrowReactions).toHaveBeenCalledWith({ from: pair.from, to: pair.to });
  });
});
