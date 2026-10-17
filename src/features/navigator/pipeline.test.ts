import { describe, expect, it } from 'vitest';
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import { type CanonicalState, type ChemicalClass, type ReactionScheme, type ViewPreset } from '@/core/schema';
import { unarrangedDemoState } from '@/test-support/app-boot-kit';
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

// The demo WITHOUT its arrangement, laid out layered (`layoutAlgorithm`): the overview itself is always a grid now, but the pipeline's
// layered path (ELK's stable first view, previous positions) stays tested. The grid overview is in pipeline-arranged.test.ts.
const layeredDemo = unarrangedDemoState;

interface Setup {
  readonly store: StoreHandle;
  readonly rig: NavigatorRig;
  readonly model: NavigatorModel;
}

async function started(state: CanonicalState = layeredDemo(), options: { measurerReady?: Promise<void> } = {}): Promise<Setup> {
  const store = createCanonicalStore({ initial: state, validateInitial: false });
  const rig = navigatorRig(store, options);
  const model = createNavigatorModel(rig.ports, { layoutAlgorithm: 'layered' });
  model.start();
  await settle();
  return { store, rig, model };
}

// The request changes through the filters (the overview does not expand, ADR-037): a text filter narrows the drawing, '' widens it again.
const filterBy = (rig: NavigatorRig, text: string): void =>
  rig.ui.filters.getState().setFilters({ scopes: [], topicIds: [], reagentFamilies: [], ...(text === '' ? {} : { text }) });
const NARROW = 'ethanol';

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
    expect(state.layout).not.toBe('grid');
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
    const firstIds = new Set(rig.layout.requests[0]?.nodes.map((n) => n.id));
    filterBy(rig, NARROW);
    await settle();
    expect(rig.layout.requests).toHaveLength(3);
    const third = rig.layout.requests[2];
    const previous = Object.keys(third?.previous ?? {});
    expect(previous.length).toBeGreaterThan(0);
    // only nodes that are still in the request, and only ones that were drawn before
    const present = new Set(third?.nodes.map((n) => n.id));
    for (const id of previous) {
      expect(present.has(id)).toBe(true);
      expect(firstIds.has(id)).toBe(true);
    }
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
    filterBy(rig, NARROW);
    await settle();
    expect(rig.layout.requests).toHaveLength(3);
    filterBy(rig, '');
    await settle();
    expect(rig.layout.requests).toHaveLength(4);
    model.stop();
  });

  it('a failure of the second layout is an error state, and the first answer is never drawn', async () => {
    const store = createCanonicalStore({ initial: layeredDemo(), validateInitial: false });
    const rig = navigatorRig(store);
    let calls = 0;
    const real = rig.layout.layout.bind(rig.layout);
    rig.layout.layout = async (view, request) => {
      calls += 1;
      return calls === 2 ? { ok: false, code: 'UNAVAILABLE', message: 'second layout failed' } : real(view, request);
    };
    const model = createNavigatorModel(rig.ports, { layoutAlgorithm: 'layered' });
    model.start();
    await settle();
    expect(model.getState().scene).toBeNull();
    expect(model.getState().error?.message).toBe('second layout failed');
    model.stop();
  });

  it('a request superseded during the second layout is never drawn', async () => {
    const store = createCanonicalStore({ initial: layeredDemo(), validateInitial: false });
    const rig = navigatorRig(store);
    let release: () => void = () => undefined;
    const real = rig.layout.layout.bind(rig.layout);
    let calls = 0;
    rig.layout.layout = async (view, request) => {
      calls += 1;
      if (calls === 2) await new Promise<void>((resolve) => (release = resolve));
      return real(view, request);
    };
    const model = createNavigatorModel(rig.ports, { layoutAlgorithm: 'layered' });
    model.start();
    await settle();
    filterBy(rig, NARROW);
    await settle();
    release();
    await settle();
    // the Scene on screen answers the narrowed view (fewer arrows), never the first one
    const all = rig.layout.requests[0]?.edges.length ?? 0;
    const narrowed = rig.layout.requests.filter((r) => r.edges.length < all);
    expect(narrowed.length).toBeGreaterThan(0);
    const drawn = model.getState().scene;
    expect(narrowed.map((r) => layoutCacheKey(r))).toContain(drawn?.layoutKey);
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

  it('the overview is calm: no arrow text, whatever the schemes say; a scheme edit rebuilds the Scene but not the projection', async () => {
    const { model, store } = await started();
    const arrows = model.getState().scene?.edges.filter((e) => e.semantic === 'transforms_to') ?? [];
    expect(arrows.length).toBeGreaterThan(0);
    expect(arrows.every((e) => e.above === undefined && e.below === undefined)).toBe(true);
    const before = model.stats();
    const scheme = Object.values(store.getState().records.reaction_scheme)[0] as ReactionScheme;
    const moved = scheme.placements.map((p) => (p.position === 'below_arrow' ? { ...p, position: 'above_arrow' as const } : p));
    expect(moved).not.toEqual(scheme.placements);
    mustCommit(store.dispatch(envelope('move reagents', { type: 'record.update', record: { ...scheme, placements: moved } })));
    await settle();
    const after = model.getState().scene?.edges.filter((e) => e.semantic === 'transforms_to') ?? [];
    expect(after.every((e) => e.above === undefined && e.below === undefined)).toBe(true);
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
    mustCommit(store.replaceState(layeredDemo(), 'import'));
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
    const store = createCanonicalStore({ initial: layeredDemo(), validateInitial: false });
    const rig = navigatorRig(store);
    rig.layout.hold = new Promise<void>((resolve) => (release = resolve));
    const model = createNavigatorModel(rig.ports, { layoutAlgorithm: 'layered' });
    model.start();
    await settle();
    expect(model.getState().scene).toBeNull();
    // a second request while the first is held
    filterBy(rig, NARROW);
    await settle();
    expect(rig.layout.requests).toHaveLength(2);
    release();
    await settle();
    const scene = model.getState().scene;
    // the narrowed drawing: the SECOND request's Scene, not the first's
    const all = rig.layout.requests.map((r) => r.edges.length);
    const narrowed = rig.layout.requests.filter((r) => r.edges.length < Math.max(...all));
    expect(narrowed.map((r) => layoutCacheKey(r))).toContain(scene?.layoutKey);
    expect(model.stats().scenes).toBe(1);
    model.stop();
  });
});

describe('failures and the skeleton', () => {
  it('a layout failure is an error state with its code, not a blank canvas', async () => {
    const store = createCanonicalStore({ initial: layeredDemo(), validateInitial: false });
    const rig = navigatorRig(store);
    rig.layout.failure = { ok: false, code: 'UNAVAILABLE', message: 'no worker' };
    const model = createNavigatorModel(rig.ports, { layoutAlgorithm: 'layered' });
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
    const { model, rig } = await started(layeredDemo(), { measurerReady: new Promise<void>((resolve) => (ready = resolve)) });
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
    filterBy(rig, NARROW);
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

describe('the overview does not expand, and the selection (step 5.5a part 2; ADR-037)', () => {
  it('ignores what the expansion store holds: hubs only, no member, nothing removed or logged', async () => {
    const store = createCanonicalStore({ initial: layeredDemo(), validateInitial: false });
    const rig = navigatorRig(store);
    const held = { expanded: [{ nodeId: 'cls_alcohols', direction: 'both' as const }, { nodeId: 'not-a-hub', direction: 'both' as const }], collapsedEdgeIds: [] };
    rig.ui.expansion.setState({ expansion: held });
    const model = createNavigatorModel(rig.ports, { layoutAlgorithm: 'layered' });
    model.start();
    await settle();
    expect(model.getState().scene?.nodes).toHaveLength(16);
    expect(model.getState().scene?.nodes.some((n) => n.box === 'member')).toBe(false);
    expect(rig.ui.expansion.getState().expansion).toBe(held);
    expect(rig.logs).toEqual([]);
    // a later change of the store asks for nothing
    const calls = rig.layout.requests.length;
    rig.ui.expansion.getState().toggle('cls_aldehydes');
    await settle();
    expect(rig.layout.requests).toHaveLength(calls);
    model.stop();
  });

  it('clears a selection that is not in the new Scene and logs it; keeps one that is', async () => {
    const { model, rig } = await started();
    const hub = model.getState().hubIds[0] as string;
    rig.ui.selection.getState().select({ kind: 'node', id: hub });
    filterBy(rig, ''); // a new, equal filters object: the request is asked again, the drawing is the same
    await settle();
    expect(rig.ui.selection.getState().selected).toEqual({ kind: 'node', id: hub });
    rig.ui.selection.getState().select({ kind: 'edge', id: 'gone' });
    filterBy(rig, '');
    await settle();
    expect(rig.ui.selection.getState().selected).toBeNull();
    expect(rig.logs.filter((line) => line.type === 'selection_cleared')).toHaveLength(1);
    model.stop();
  });
});

describe('the Structures setting (equation step, part 4)', () => {
  it('a change of the mode rebuilds the scene (the nodes carry keys of the new mode) and reuses the layout', async () => {
    const store = createCanonicalStore({ initial: layeredDemo(), validateInitial: false });
    const rig = navigatorRig(store, { depictions: true });
    let mode: 'skeletal' | 'condensed' = 'skeletal';
    const listeners = new Set<() => void>();
    const depictions = { ...(rig.depictions as NonNullable<typeof rig.depictions>), mode: () => mode, onMode: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)) };
    const model = createNavigatorModel({ ...rig.ports, depictions }, { layoutAlgorithm: 'layered' });
    model.start();
    await settle();
    // (the demo's overview draws families, so no node has a structure key here: what is proved is the rebuild; the keys' mode is proved by the binding)
    const keysOf = (): (string | undefined)[] => (model.getState().scene?.nodes ?? []).map((n) => n.depictionKey);
    expect(keysOf().every((k) => k === undefined || !k.includes('#'))).toBe(true);
    const calls = model.stats().layoutCalls;
    const scenes = model.stats().scenes;
    mode = 'condensed';
    listeners.forEach((l) => l());
    await settle();
    expect(model.stats().scenes).toBe(scenes + 1);
    expect(model.stats().layoutCalls).toBe(calls); // the same request: the layout is not asked again
    expect(keysOf().filter((k) => k !== undefined).every((k) => (k as string).endsWith('#condensed'))).toBe(true);
    model.stop();
    expect(listeners.size).toBe(0); // stop unsubscribes
  });
});
