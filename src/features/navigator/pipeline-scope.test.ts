/** "Only <exam>" on the map (step 8.3b, B2; ADR-046): arrows and counts of reactions outside the exam are left out; a family whose reactions are all outside fades, it is not removed. */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { navigatorRig } from '@/test-support/navigator-kit';
import { createNavigatorModel } from './pipeline';
import { keepUnmapped, onlyFilters, SCOPES_KEPT } from './scope-filters';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};
const MAIN = { examId: 'exm_jee-main', examVersionId: 'exv_jee-main-2026' } as never;
const reactionsDrawn = (edges: readonly { readonly bundleSize?: number }[]): number => edges.reduce((sum, edge) => sum + (edge.bundleSize ?? 1), 0);

describe('onlyFilters', () => {
  const base = { scopes: [], topicIds: [], reagentFamilies: [] };
  it('Only asks for every scope but outside; Everything leaves the filters alone', () => {
    expect(onlyFilters(base, false)).toBe(base);
    expect(onlyFilters(base, true)).toEqual({ scopes: [...SCOPES_KEPT], topicIds: [], reagentFamilies: [] });
    expect(SCOPES_KEPT).not.toContain('outside');
  });
});

describe('keepUnmapped', () => {
  const lens = (answer: string) => ((): never => answer as never);
  it('with Only an unmapped record counts as kept (not proven outside); every other answer is unchanged', () => {
    expect(keepUnmapped(lens('unmapped'), true)({ kind: 'reaction', id: 'r' } as never)).toBe('official');
    expect(keepUnmapped(lens('outside'), true)({ kind: 'reaction', id: 'r' } as never)).toBe('outside');
    expect(keepUnmapped(lens('enrichment'), true)({ kind: 'reaction', id: 'r' } as never)).toBe('enrichment');
  });
  it('with Everything the lens is untouched', () => {
    const one = lens('unmapped');
    expect(keepUnmapped(one, false)).toBe(one);
  });
});

describe('the pipeline under an exam', () => {
  it('Only leaves out the arrows of reactions outside the exam; Everything brings them back; the families stay either way', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    const all = reactionsDrawn(model.getState().scene?.edges ?? []);
    const hubs = model.getState().scene?.nodes.length ?? 0;
    rig.ui.exam.getState().setActive(MAIN);
    await settle();
    const only = reactionsDrawn(model.getState().scene?.edges ?? []);
    expect(only).toBeGreaterThan(0);
    expect(only).toBeLessThan(all);
    expect(model.getState().scene?.nodes.length).toBe(hubs); // a family is faded, never removed
    rig.ui.exam.getState().setMode('everything');
    await settle();
    expect(reactionsDrawn(model.getState().scene?.edges ?? [])).toBe(all);
    expect(model.getState().scene?.nodes.length).toBe(hubs);
    rig.ui.exam.getState().setMode('only');
    await settle();
    expect(reactionsDrawn(model.getState().scene?.edges ?? [])).toBe(only);
    model.stop();
  });

  it('a family whose every reaction is outside stays on the map, faded, under Only', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    rig.ui.exam.getState().setActive(MAIN);
    await settle();
    const faded = (model.getState().scene?.nodes ?? []).filter((node) => node.state.dimmed).length;
    rig.ui.exam.getState().setMode('everything');
    await settle();
    expect((model.getState().scene?.nodes ?? []).filter((node) => node.state.dimmed).length).toBe(faded);
    model.stop();
  });
});
