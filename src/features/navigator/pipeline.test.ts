import { describe, expect, it } from 'vitest';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import { emptyRecordTables, type CanonicalState, type ChemicalClass, type ReactionScheme, type ViewPreset } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { envelope, mustCommit } from '@/test-support/command-kit';
import { navigatorRig, type NavigatorRig } from '@/test-support/navigator-kit';
import { layoutCacheKey } from '@/layout';
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
    // The first view asks twice (item b): once without previous positions, once with that result as previous; only the second is drawn.
    expect(model.stats()).toMatchObject({ projections: 1, sizes: 1, layoutCalls: 2, scenes: 1 });
    expect(rig.layout.requests).toHaveLength(2);
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
    expect(rig.layout.requests).toHaveLength(3);
    const third = rig.layout.requests[2];
    expect(Object.keys(third?.previous ?? {}).length).toBe(16);
    model.stop();
  });
});

describe('a stable first view (step 5.5a, item b)', () => {
  it('shows only the second answer: the first result is the previous positions of the second request', async () => {
    const { model, rig } = await started();
    const [first, second] = rig.layout.requests;
    expect(first?.previous).toBeUndefined();
    expect(Object.keys(second?.previous ?? {})).toEqual(Object.keys(second?.previous ?? {}).slice().sort());
    expect(second?.previous).toBeDefined();
    // Same graph, same hints: the two requests differ only in `previous` (and nothing else is asked).
    expect({ ...second, previous: undefined, requestId: '' }).toEqual({ ...first, previous: undefined, requestId: '' });
    // The Scene stands on the second answer: its positions are the second result's, not the first's.
    const drawn = model.getState().scene;
    expect(drawn?.layoutKey).toBe(layoutCacheKey(second as NonNullable<typeof second>));
    expect(drawn?.layoutKey).not.toBe(layoutCacheKey(first as NonNullable<typeof first>));
    model.stop();
  });

  it('is bounded: two layouts per first view, and a rebuild with previous positions asks once', async () => {
    const { model, rig } = await started();
    expect(rig.layout.requests).toHaveLength(2);
    rig.ui.expansion.getState().toggle('cls_alcohols');
    await settle();
    expect(rig.layout.requests).toHaveLength(3);
    rig.ui.expansion.getState().toggle('cls_alcohols');
    await settle();
    expect(rig.layout.requests).toHaveLength(4);
    model.stop();
  });

  it('a failure of the second layout is an error state, and the first answer is never drawn', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    let calls = 0;
    const real = rig.layout.layout.bind(rig.layout);
    rig.layout.layout = async (view, request) => {
      calls += 1;
      return calls === 2 ? { ok: false, code: 'UNAVAILABLE', message: 'second layout failed' } : real(view, request);
    };
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    expect(model.getState().scene).toBeNull();
    expect(model.getState().error?.message).toBe('second layout failed');
    model.stop();
  });

  it('a request superseded during the second layout is never drawn', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    let release: () => void = () => undefined;
    const real = rig.layout.layout.bind(rig.layout);
    let calls = 0;
    rig.layout.layout = async (view, request) => {
      calls += 1;
      if (calls === 2) await new Promise<void>((resolve) => (release = resolve));
      return real(view, request);
    };
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    rig.ui.expansion.getState().toggle('cls_alcohols');
    await settle();
    release();
    await settle();
    // the Scene on screen answers the expanded view, never the first one
    expect(model.getState().scene?.nodes.some((n) => n.box === 'member')).toBe(true);
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
    expect(rig.layout.requests).toHaveLength(2);
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
    expect(rig.layout.requests.length).toBeLessThanOrEqual(3);
    model.stop();
  });

  it('a scheme placement edit changes the arrow text, and does not rebuild the projection', async () => {
    const { model, store } = await started();
    const edge = model.getState().scene?.edges.find((e) => e.id !== '' && e.above !== undefined && (e.below ?? []).length > 0 && e.from === 'cls_ketones' && e.to === 'cls_alcohols');
    expect(edge?.below?.map((run) => run.text).join('')).toContain('H3O+');
    const before = model.stats();
    const scheme = Object.values(store.getState().records.reaction_scheme)[0] as ReactionScheme;
    const moved = scheme.placements.map((p) => (p.position === 'below_arrow' ? { ...p, position: 'above_arrow' as const } : p));
    expect(moved).not.toEqual(scheme.placements);
    mustCommit(store.dispatch(envelope('move reagents', { type: 'record.update', record: { ...scheme, placements: moved } })));
    await settle();
    const after = model.getState().scene?.edges.find((e) => e.from === 'cls_ketones' && e.to === 'cls_alcohols');
    // the participants left the below side; the conditions of the stages stay there (step 5.5a part 3, item l)
    expect(after?.below?.map((run) => run.text).join('') ?? '').toBe('1. anhydrous, 2. acidic medium');
    expect(model.stats().projections).toBe(before.projections);
    expect(model.stats().scenes).toBe(before.scenes + 1);
    model.stop();
  });

  it('an identical layout request reuses the last result', async () => {
    const { model, store, rig } = await started();
    // A rename to a name of the same width (the fake measurer counts characters): the box sizes, the label sizes and so the request stay the same.
    const hub = store.getState().records.class['cls_alcohols' as keyof CanonicalState['records']['class']] as ChemicalClass;
    const same = (hub.names.display ?? hub.names.canonical).toUpperCase();
    mustCommit(store.dispatch(envelope('rename hub', { type: 'record.update', record: { ...hub, names: { ...hub.names, display: same } } })));
    await settle();
    expect(rig.layout.requests).toHaveLength(2);
    expect(model.stats().layoutCalls).toBe(2);
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

describe('the expansion state and the selection (step 5.5a part 2)', () => {
  it('removes an expansion entry that names no admitted hub, logs it, and builds the projection again without it', async () => {
    const store = createCanonicalStore({ initial: demoState(), validateInitial: false });
    const rig = navigatorRig(store);
    rig.ui.expansion.setState({ expansion: { expanded: [{ nodeId: 'cls_alcohols', direction: 'both' }, { nodeId: 'not-a-hub', direction: 'both' }], collapsedEdgeIds: [] } });
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    expect(rig.ui.expansion.getState().expansion.expanded).toEqual([{ nodeId: 'cls_alcohols', direction: 'both' }]);
    expect(rig.logs.filter((line) => line.type === 'expansion_pruned')).toHaveLength(1);
    expect(model.getState().error).toBeNull();
    // one run only: the removal did not start a second layout (the two requests are the first view's, item b)
    expect(rig.layout.requests).toHaveLength(2);
    model.stop();
  });

  it('keeps every entry while the store holds no record: an empty store admits no hub and must not wipe what was saved', async () => {
    const store = createCanonicalStore({ initial: { ...demoState(), records: emptyRecordTables() }, validateInitial: false });
    const rig = navigatorRig(store);
    const saved = { expanded: [{ nodeId: 'cls_alcohols', direction: 'both' as const }], collapsedEdgeIds: [] };
    rig.ui.expansion.setState({ expansion: saved });
    const model = createNavigatorModel(rig.ports);
    model.start();
    await settle();
    expect(rig.ui.expansion.getState().expansion).toBe(saved);
    expect(rig.logs.some((line) => line.type === 'expansion_pruned')).toBe(false);
    model.stop();
  });

  it('clears a selection that is not in the new Scene and logs it; keeps one that is', async () => {
    const { model, rig } = await started();
    const hub = model.getState().hubIds[0] as string;
    rig.ui.selection.getState().select({ kind: 'node', id: hub });
    rig.ui.expansion.getState().toggle(model.getState().hubIds[1] as string);
    await settle();
    expect(rig.ui.selection.getState().selected).toEqual({ kind: 'node', id: hub });
    rig.ui.selection.getState().select({ kind: 'edge', id: 'gone' });
    rig.ui.expansion.getState().toggle(model.getState().hubIds[2] as string);
    await settle();
    expect(rig.ui.selection.getState().selected).toBeNull();
    expect(rig.logs.filter((line) => line.type === 'selection_cleared')).toHaveLength(1);
    model.stop();
  });
});
