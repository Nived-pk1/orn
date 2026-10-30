// @vitest-environment jsdom
/**
 * The inspector's "has no place in this view" line (7.3a A3): it speaks about the navigator map, so it is shown in the navigator and
 * NOT while an explorer (Reactions, Precursors, later Reagents) is the view. The host says so with `explorerShown`.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { Inspector } from './inspector';

afterEach(cleanup);
beforeAll(fakeLayout);
beforeAll(preloadViews);

const state = demoState();
const reagent = { kind: 'reagent', id: Object.keys(state.records.reagent)[0] as string } as RecordRef;

function show(host: Record<string, unknown>) {
  const rig = inspectorRig(state);
  render(<Inspector ports={rig.ports} host={{ ...rig.host, ...host }} />);
  act(() => rig.inspector.getState().open(reagent));
}

describe('the place line', () => {
  it('stays in the navigator: a reagent has no place on the map', () => {
    show({ navigatorShown: true });
    expect(document.body.textContent).toContain('has no place in this view');
  });
  it('is not shown in an explorer mode', () => {
    show({ navigatorShown: false, explorerShown: true });
    expect(document.body.textContent).not.toContain('has no place in this view');
  });
  it('is shown in another mode that is not an explorer (unchanged)', () => {
    show({ navigatorShown: false });
    expect(document.body.textContent).toContain('has no place in this view');
  });
});
