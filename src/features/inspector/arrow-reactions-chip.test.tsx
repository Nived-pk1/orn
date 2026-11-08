// @vitest-environment jsdom
/** The "Extra" / "Background" chip on the reaction rows of an arrow's view (step 8.4d, E4), under a chosen exam. */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { createActiveExamStore } from '@/ui/state';
import { Inspector } from './inspector';

const lens = vi.hoisted(() => ({ every: 'official' }));
vi.mock('@/core/graph', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createScopeOf: () => () => lens.every,
}));

afterEach(() => {
  cleanup();
  lens.every = 'official';
});
beforeAll(fakeLayout);
beforeAll(preloadViews);

async function show(examChosen: boolean) {
  const rig = inspectorRig(demoState());
  // the rig's ports have no exam store: give them one, with an exam chosen or not
  const exam = createActiveExamStore(examChosen ? ({ examId: 'exm_x', examVersionId: 'exv_x' } as never) : null);
  const ports = { ...rig.ports, ui: { ...rig.ports.ui, exam } };
  const host = { ...rig.host, edgeEnds: () => ({ from: 'cls_alcohols', to: 'cls_aldehydes' }) };
  render(<Inspector ports={ports} host={host} />);
  act(() => {
    rig.ports.ui.selection.getState().select({ kind: 'edge', id: 'e1' });
    rig.ports.ui.selection.getState().reveal();
  });
  return screen.findByRole('region', { name: 'Reactions on this arrow' });
}

describe('the arrow view rows', () => {
  it('an enrichment reaction shows "Extra", a prerequisite one "Background", under a chosen exam', async () => {
    lens.every = 'enrichment';
    expect(within(await show(true)).getAllByText('Extra').length).toBeGreaterThan(0);
    cleanup();
    lens.every = 'prerequisite';
    expect(within(await show(true)).getAllByText('Background').length).toBeGreaterThan(0);
  });
  it('no chip without a chosen exam', async () => {
    lens.every = 'enrichment';
    expect(within(await show(false)).queryByText('Extra')).toBeNull();
  });
});
