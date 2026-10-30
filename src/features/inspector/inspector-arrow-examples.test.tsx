// @vitest-environment jsdom
/**
 * An arrow's reaction list folds examples (7.3a C3): the general reaction is a row, its example sits in a CLOSED "Examples (n)"
 * disclosure under it, and the title and the "Open these n reactions" button count rows, with "(+ n examples)" said in words.
 * Written first (seen red).
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { Inspector } from './inspector';

afterEach(cleanup);
beforeAll(fakeLayout);
beforeAll(preloadViews);

function show() {
  const rig = inspectorRig(demoState());
  const showArrowReactions = vi.fn();
  const host = { ...rig.host, showArrowReactions, edgeEnds: () => ({ from: 'cls_alcohols', to: 'cls_aldehydes' }) };
  render(<Inspector ports={rig.ports} host={host} />);
  act(() => {
    rig.ports.ui.selection.getState().select({ kind: 'edge', id: 'e1' });
    rig.ports.ui.selection.getState().reveal();
  });
  return { showArrowReactions, region: screen.getByRole('region', { name: 'Reactions on this arrow' }) };
}

describe('Alcohols → Aldehydes (the PCC oxidation and its example)', () => {
  it('counts rows, and says the folded example in words', () => {
    const { region, showArrowReactions } = show();
    expect(within(region).getByRole('heading', { name: 'Reactions on this arrow (2) (+ 1 example)' })).toBeTruthy();
    fireEvent.click(within(region).getByRole('button', { name: 'Open these 2 reactions in Reactions' }));
    expect(showArrowReactions).toHaveBeenCalledWith({ from: 'cls_alcohols', to: 'cls_aldehydes' });
  });

  it('the example is not a row of its own: it is in a closed "Examples (1)" disclosure under the general reaction', () => {
    const { region } = show();
    const disclosure = within(region).getByText('Examples (1)').closest('details') as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(within(disclosure).getByRole('button', { name: 'Ethanol → ethanal (PCC)', hidden: true })).toBeTruthy();
    expect(within(region).getAllByRole('button', { name: 'Ethanol → ethanal (PCC)', hidden: true })).toHaveLength(1);
  });
});
