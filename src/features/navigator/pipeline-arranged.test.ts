import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig, type NavigatorRig } from '@/test-support/navigator-kit';
import { createNavigatorModel, type NavigatorModel } from './pipeline';

// The arranged overview on the demo (step 5.5c): the grid layout. The layered path (ELK's stable first view, previous positions) is in pipeline.test.ts.

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

async function started(): Promise<{ rig: NavigatorRig; model: NavigatorModel }> {
  const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
  const rig = navigatorRig(store);
  const model = createNavigatorModel(rig.ports);
  model.start();
  await settle();
  return { rig, model };
}

const filterBy = (rig: NavigatorRig, text: string): void =>
  rig.ui.filters.getState().setFilters({ scopes: [], topicIds: [], reagentFamilies: [], ...(text === '' ? {} : { text }) });
const NARROW = 'ethanol';

describe('the arranged overview on the demo dataset (step 5.5c): the grid layout, one ask, no previous positions', () => {
  it('asks the grid layout once for the first view: every hub has its cell and the Scene is drawn from that one answer', async () => {
    const { model, rig } = await started();
    const state = model.getState();
    expect(state.error).toBeNull();
    expect(state.scene?.nodes).toHaveLength(16);
    expect(model.stats()).toMatchObject({ projections: 1, sizes: 1, layoutCalls: 1, scenes: 1 });
    const request = rig.layout.requests[0];
    expect(rig.layout.requests).toHaveLength(1);
    expect(request?.algorithm).toBe('grid');
    expect(state.layout).toBe('grid');
    expect(request?.previous).toBeUndefined();
    const cells = request?.nodes.filter((n) => n.cell !== undefined).map((n) => n.id);
    expect(cells).toHaveLength(15);
    expect(request?.nodes.some((n) => n.id === 'virtual:unclassified:hub')).toBe(true);
    expect(request?.nodes.find((n) => n.id === 'virtual:unclassified:hub')?.cell).toBeUndefined();
    model.stop();
  });

  it('a filter that changes the drawing asks again, still the grid and still without previous positions', async () => {
    const { model, rig } = await started();
    filterBy(rig, NARROW);
    await settle();
    expect(rig.layout.requests.length).toBeGreaterThanOrEqual(2);
    for (const request of rig.layout.requests) {
      expect(request.algorithm).toBe('grid');
      expect(request.previous).toBeUndefined();
    }
    model.stop();
  });
});
