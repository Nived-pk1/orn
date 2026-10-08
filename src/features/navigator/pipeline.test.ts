import { describe, expect, it } from 'vitest';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import type { CanonicalState, ChemicalClass, ReactionScheme, ViewPreset } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { envelope, mustCommit } from '@/test-support/command-kit';
import { navigatorRig, type NavigatorRig } from '@/test-support/navigator-kit';
import { createNavigatorModel, SKELETON_DELAY_MS, type NavigatorModel } from './pipeline';

// What jsdom and Node lack and these tests stub: no layout worker (a fake service over the pure fallback layout), no fonts or canvas
// (a deterministic fake measurer), no timers of the page (manual timers). The browser parts are proved by tests/e2e.

const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
};

interface Setup {
  readonly store: StoreHandle;
  readonly rig: NavigatorRig;
  readonly model: NavigatorModel;
}

async function started(state: CanonicalState = demoState(), options: { measurerReady?: Promise<void> } = {}): Promise<Setup> {
  const store = createCanonicalStore({ initial: state, validateInitial: false });
  const rig = navigatorRig(store, options);
  const model = createNavigatorModel(rig.ports);
  model.start();
  await settle();
  return { store, rig, model };
}

const labelOf = (model: NavigatorModel, id: string): string =>
  (model.getState().scene?.nodes.find((n) => n.id === id)?.label ?? []).map((run) => run.text).join('');

describe('the pipeline on the demo dataset', () => {
  it('builds one Scene whose nodes and edges are the projection', async () => {
    const { model, rig } = await started();
    const state = model.getState();
    expect(state.error).toBeNull();
    expect(state.scene?.nodes).toHaveLength(16);
    expect(state.scene?.edges.length).toBeGreaterThan(0);
    expect(state.hubIds).toHaveLength(16);
    expect(model.stats()).toMatchObject({ projections: 1, sizes: 1, layoutCalls: 1, scenes: 1 });
    expect(rig.layout.requests).toHaveLength(1);
    model.stop();
  });

  it('asks for the indexes at every build and keeps no handle', async () => {
    const { model, rig, store } = await started();
    expect(rig.indexAsks()).toBe(1);
    const kind = Object.values(store.getState().records.class)[0] as ChemicalClass;
    mustCommit(store.dispatch(envelope('rename', { type: 'record.update', record: { ...kind, names: { ...kind.names, display: 'Renamed' } } })));
    await settle();
    expect(rig.indexAsks()).toBe(2);
    model.stop();
  });

  it('sends the previous positions of the nodes still present when it asks again', async () => {
    const { model, rig } = await started();
    expect(rig.layout.requests[0]?.previous).toBeUndefined();
    rig.ui.expansion.getState().toggle('cls_alcohols');
    await settle();
    expect(rig.layout.requests).toHaveLength(2);
    const second = rig.layout.requests[1];
    expect(Object.keys(second?.previous ?? {}).length).toBe(16);
    model.stop();
  });
});

describe('what an edit rebuilds (counters)', () => {
  it('an edit of a kind in neither list rebuilds no projection, no sizes, no layout and no Scene', async () => {
    const { model, store, rig } = await started();
    const before = model.stats();
    const scene = model.getState().scene;
    const preset = Object.values(store.getState().records.view_preset)[0] as ViewPreset;
    mustCommit(store.dispatch(envelope('rename preset', { type: 'record.update', record: { ...preset, name: `${preset.name} (edited)` } })));
    await settle();
    expect(model.stats()).toEqual(before);
    expect(model.getState().scene).toBe(scene);
    expect(rig.layout.requests).toHaveLength(1);
    model.stop();
  });

  it('a hub renamed through a command changes its label (the Scene ports are fresh)', async () => {
    const { model, store, rig } = await started();
    const hub = store.getState().records.class['cls_alcohols' as keyof CanonicalState['records']['class']] as ChemicalClass;
    expect(labelOf(model, 'cls_alcohols')).toBe(hub.names.display ?? hub.names.canonical);
    mustCommit(store.dispatch(envelope('rename hub', { type: 'record.update', record: { ...hub, names: { ...hub.names, display: 'Alcohols (renamed)' } } })));
    await settle();
    expect(labelOf(model, 'cls_alcohols')).toBe('Alcohols (renamed)');
    // the projection did not change (same object kept), the sizes were recomputed
    expect(model.stats().sizes).toBe(2);
    expect(model.stats().scenes).toBe(2);
    expect(rig.layout.requests.length).toBeLessThanOrEqual(2);
    model.stop();
  });

  it('a scheme placement edit changes the arrow text, and does not rebuild the projection', async () => {
    const { model, store } = await started();
    const edge = model.getState().scene?.edges.find((e) => e.id !== '' && e.above !== undefined && (e.below ?? []).length > 0 && e.from === 'cls_ketones' && e.to === 'cls_alcohols');
    expect(edge?.below?.map((run) => run.text).join('')).toContain('Acid');
    const before = model.stats();
    const scheme = Object.values(store.getState().records.reaction_scheme)[0] as ReactionScheme;
    const moved = scheme.placements.map((p) => (p.position === 'below_arrow' ? { ...p, position: 'above_arrow' as const } : p));
    expect(moved).not.toEqual(scheme.placements);
    mustCommit(store.dispatch(envelope('move reagents', { type: 'record.update', record: { ...scheme, placements: moved } })));
    await settle();
    const after = model.getState().scene?.edges.find((e) => e.from === 'cls_ketones' && e.to === 'cls_alcohols');
    expect(after?.below).toBeUndefined();
    expect(model.stats().projections).toBe(before.projections);
    expect(model.stats().scenes).toBe(before.scenes + 1);
    model.stop();
  });

  it('an identical layout request reuses the last result', async () => {
    const { model, store, rig } = await started();
    const scheme = Object.values(store.getState().records.reaction_scheme)[0] as ReactionScheme;
    mustCommit(store.dispatch(envelope('touch scheme', { type: 'record.update', record: { ...scheme, showStageNumbers: !scheme.showStageNumbers } })));
    await settle();
    expect(rig.layout.requests).toHaveLength(1);
    expect(model.stats().layoutCalls).toBe(1);
    expect(model.stats().scenes).toBe(2);
    model.stop();
  });

  it('a replace rebuilds everything', async () => {
    const { model, store } = await started();
    const before = model.stats();
    mustCommit(store.replaceState(demoState(), 'import'));
    await settle();
    expect(model.stats().projections).toBe(before.projections + 1);
    expect(model.stats().scenes).toBe(before.scenes + 1);
    model.stop();
  });

  it('the previous Projection object is kept when the rebuilt one is the same', async () => {
    const { model, store } = await started();
    const key = model.getState().scene?.projectionKey;
    const hub = store.getState().records.class['cls_alcohols' as keyof CanonicalState['records']['class']] as ChemicalClass;
    mustCommit(store.dispatch(envelope('rename hub', { type: 'record.update', record: { ...hub, names: { ...hub.names, display: 'X' } } })));
    await settle();
    // a hub's kind is in the projection list, so the projection was rebuilt; it is identical, so the old object (and its key) stays
    expect(model.stats().projections).toBe(2);
    expect(model.getState().scene?.projectionKey).toBe(key);
    model.stop();
  });
});

describe('a superseded result is never shown', () => {
  it('a slow first layout is replaced by the second one', async () => {
    let release: () => void = () => undefined;
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    rig.layout.hold = new Promise<void>((resolve) => (release = resolve));
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    expect(model.getState().scene).toBeNull();
    // a second request while the first is held
    rig.ui.expansion.getState().toggle('cls_alcohols');
    await settle();
    expect(rig.layout.requests).toHaveLength(2);
    release();
    await settle();
    const scene = model.getState().scene;
    expect(scene?.nodes.length).toBeGreaterThan(16); // the expanded hub's members: the SECOND request's Scene, not the first's
    expect(model.stats().scenes).toBe(1);
    model.stop();
  });
});

describe('failures and the skeleton', () => {
  it('a layout failure is an error state with its code, not a blank canvas', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    rig.layout.failure = { ok: false, code: 'UNAVAILABLE', message: 'no worker' };
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    expect(model.getState().error).toEqual({ code: 'UNAVAILABLE', message: 'no worker' });
    expect(model.getState().scene).toBeNull();
    model.stop();
  });

  it('a normal build shows no error and logs nothing', async () => {
    const { model, rig } = await started();
    expect(model.getState().error).toBeNull();
    expect(rig.logs).toEqual([]);
    model.stop();
  });

  it('the Skeleton shows only with no Scene and after 300 ms', async () => {
    let ready: () => void = () => undefined;
    const { model, rig } = await started(demoState(), { measurerReady: new Promise<void>((resolve) => (ready = resolve)) });
    expect(model.getState().skeleton).toBe(false);
    rig.timers.advance(SKELETON_DELAY_MS - 1);
    expect(model.getState().skeleton).toBe(false);
    rig.timers.advance(1);
    expect(model.getState().skeleton).toBe(true);
    ready();
    await settle();
    expect(model.getState().scene).not.toBeNull();
    expect(model.getState().skeleton).toBe(false);
    model.stop();
  });

  it('while a new layout is computed the previous Scene stays and no Skeleton shows', async () => {
    const { model, rig } = await started();
    const first = model.getState().scene;
    let release: () => void = () => undefined;
    rig.layout.hold = new Promise<void>((resolve) => (release = resolve));
    rig.ui.expansion.getState().toggle('cls_alcohols');
    await settle();
    rig.timers.advance(SKELETON_DELAY_MS * 3);
    expect(model.getState().scene).toBe(first);
    expect(model.getState().skeleton).toBe(false);
    expect(model.getState().working).toBe(true);
    release();
    await settle();
    expect(model.getState().scene).not.toBe(first);
    expect(model.getState().working).toBe(false);
    model.stop();
  });

  it('with no exam version, no record is dimmed or claimed (scopeOf answers unmapped)', async () => {
    const { model } = await started();
    expect(model.getState().scene?.nodes.every((n) => !n.state.dimmed)).toBe(true);
    model.stop();
  });
});
