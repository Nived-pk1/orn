/**
 * The scene builders (step 5.3) over real projections: determinism, nothing dropped, the layout worker's own request check, an
 * aria label on everything, and every registered projection of the demo without loss. The layout is the pure fallback of src/layout.
 * ADV-027 (the scene part) and ADV-033 (hostile names) run on the demo.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultProjectionRegistry, navigatorProjection, UNCLASSIFIED_HUB_ID, type Projection, type ProjectionRequest } from '@/core/graph';
import { documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
import { VIEW_KEYS, type CanonicalState, type RecordRef, type ViewKey } from '@/core/schema';
import { checkRequest } from '@/layout';
import { drawnPaths, type Scene, type ScenePorts } from '@/render/scene';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier, type GeneratorShape } from '@/test-support/generator';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { withNavigatorAnchors } from '@/test-support/perf-kit';
import { pipe, portsOf, type Piped } from '@/test-support/scene-kit';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const demoParsed = documentToState(buildDemoDocument());
if (!demoParsed.ok) throw new Error('the demo does not parse');
const DEMO = demoParsed.state;

const expandAll = (projection: Projection): ProjectionRequest['expansion'] => ({
  expanded: [...projection.nodes.filter((n) => n.role === 'anchor' || n.role === 'unclassified').map((n) => n.id), UNCLASSIFIED_HUB_ID].map((nodeId) => ({ nodeId, direction: 'both' as const })),
  collapsedEdgeIds: [],
});

const navigatorOf = (state: CanonicalState, expanded: boolean): Projection => {
  const ctx = contextOf(state);
  const plain = navigatorProjection.build(ctx, requestOf('navigator'));
  return expanded ? navigatorProjection.build(ctx, requestOf('navigator', { expansion: expandAll(plain) })) : plain;
};

const textOf = (runs: Scene['edges'][number]['above']): string => (runs ?? []).map((run) => run.text).join('');

/** Nothing dropped: every node, every drawn path, the totals of the projection. */
function expectNothingDropped(projection: Projection, piped: Piped): void {
  const { scene } = piped;
  expect(scene.nodes.map((n) => n.id)).toEqual(projection.nodes.map((n) => n.id));
  const paths = drawnPaths(projection);
  expect(scene.edges.map((e) => e.id)).toEqual(paths.map((p) => p.id));
  const structural = projection.edges.filter((e) => e.semantic === 'membership' || e.semantic === 'overflow');
  for (const edge of structural) expect(scene.edges.some((e) => e.id === edge.id || e.id.startsWith('bnd_'))).toBe(true);
  // Every edge of the projection is drawn by a path (itself, or its bundle), never lost.
  const named = new Set(paths.flatMap((p) => p.edges.map((e) => e.id)));
  for (const edge of projection.edges) expect(named.has(edge.id), `edge ${edge.id} is in no path`).toBe(true);
  const drawnTotal = scene.edges.reduce((sum, e) => sum + (e.bundleSize ?? 1), 0);
  // step 7.2a: the chip counts DISTINCT reactions (a bundle's `reactions`), not its arrows (`total`, which INV-22 adds up elsewhere)
  const bundleTotal = projection.bundles.reduce((sum, b) => sum + (b.reactions ?? b.total), 0);
  const bundled = new Set(projection.bundles.flatMap((b) => b.edgeIds));
  expect(drawnTotal).toBe(bundleTotal + projection.edges.filter((e) => !bundled.has(e.id)).length);
  expect(scene.truncation).toEqual(projection.truncation);
  // The request: one layout edge per path that is not a loop; it passes the worker's own check.
  expect(checkRequest(piped.request)).toBeUndefined();
  expect(piped.request.nodes).toHaveLength(projection.nodes.length);
  expect(piped.request.edges).toHaveLength(paths.filter((p) => !p.loop).length);
  expect(piped.request.edges.every((e) => e.from !== e.to)).toBe(true);
  for (const item of [...scene.nodes, ...scene.edges]) expect(item.ariaLabel.length).toBeGreaterThan(0);
  expect(scene.nodes.every((n) => n.width > 0 && n.height > 0 && Number.isFinite(n.x) && Number.isFinite(n.y))).toBe(true);
}

function checkProjection(projection: Projection, ports: ScenePorts): void {
  const first = pipe(projection, ports);
  const second = pipe(projection, ports);
  expect(second.request).toEqual(first.request);
  expect(second.scene).toEqual(first.scene);
  expect(JSON.stringify(second.scene)).toBe(JSON.stringify(first.scene));
  expectNothingDropped(projection, first);
}

describe('the builders over the navigator', () => {
  it('the demo, with and without expansion', () => {
    const ports = portsOf(DEMO, true);
    for (const expanded of [false, true]) {
      const projection = navigatorOf(DEMO, expanded);
      expect(projection.nodes.length).toBeGreaterThan(5);
      checkProjection(projection, ports);
    }
  });

  it('every generator shape, with and without expansion, with random sizes and seeds', () => {
    fc.assert(
      fc.property(fc.constantFrom<GeneratorShape>(...GENERATOR_SHAPES), fc.integer({ min: 1, max: 1_000 }), fc.integer({ min: 1, max: 12 }), fc.boolean(), (shape, seed, anchors, expanded) => {
        const parsed = documentToState(generateTier('tiny', shape, seed));
        if (!parsed.ok) throw new Error('generator produced duplicate IDs');
        const state = withNavigatorAnchors(parsed.state, anchors);
        checkProjection(navigatorOf(state, expanded), portsOf(state));
      }),
      PARAMS,
    );
  });

  it('a navigator that hit its limits still draws what it kept and says what it cut', () => {
    const ctx = contextOf(DEMO);
    const projection = navigatorProjection.build(ctx, requestOf('navigator', { limits: { maxDepth: 12, maxNodes: 6, maxEdges: 4, timeBudgetMs: 12 } }));
    expect(projection.truncation).not.toBeNull();
    checkProjection(projection, portsOf(DEMO));
  });
});

describe('ADV-005, glyph part: a loop on a real projection', () => {
  it('a dataset with no anchors is one pair, Unclassified to itself: drawn beside its node, never sent to layout', () => {
    const parsed = documentToState(generateTier('tiny', 'dense', 3));
    if (!parsed.ok) throw new Error('generator produced duplicate IDs');
    const projection = navigatorOf(parsed.state, false);
    const piped = pipe(projection, portsOf(parsed.state));
    const loop = piped.scene.edges.find((e) => e.from === e.to);
    expect(loop).toBeDefined();
    expect(loop?.bundleSize).toBe(projection.bundles[0]?.reactions);
    expect(piped.request.edges).toEqual([]);
    expect(piped.scene.nodes.map((n) => n.glyph)).toContain('unclassified');
    expectNothingDropped(projection, piped);
  });
});

describe('every registered projection of the demo, without loss', () => {
  const registry = createDefaultProjectionRegistry();
  const indexes = indexEngine.build(DEMO, 1);
  const species: RecordRef = { kind: 'species', id: Object.keys(DEMO.records.species).sort()[0] as string };
  const reaction: RecordRef = { kind: 'reaction', id: Object.keys(DEMO.records.reaction).sort()[0] as string };
  const cls: RecordRef = { kind: 'class', id: Object.keys(DEMO.records.class).sort()[0] as string };
  const requests = (view: ViewKey): ProjectionRequest[] => [requestOf(view), requestOf(view, { focus: [species] }), requestOf(view, { focus: [reaction] }), requestOf(view, { focus: [cls] })];

  it('has at least the navigator, the reaction explorer and the precursor explorer', () => {
    expect(registry.views().length).toBeGreaterThanOrEqual(3);
    expect(VIEW_KEYS.length).toBeGreaterThanOrEqual(registry.views().length);
  });

  const covered = new Set<ViewKey>();
  for (const view of registry.views()) {
    it(`${view}`, () => {
      for (const request of requests(view)) {
        const result = registry.build({ state: DEMO, indexes, scopeOf: () => 'unmapped' }, request);
        if (!result.ok || result.projection.nodes.length === 0) continue;
        covered.add(view);
        checkProjection(result.projection, portsOf(DEMO));
      }
    });
  }

  it('checked a projection with nodes for the navigator and both explorers (a view that draws nothing has nothing to lose)', () => {
    for (const view of ['navigator', 'reaction_explorer', 'precursor_explorer'] as const) expect(covered.has(view), view).toBe(true);
  });
});

describe('ADV-027, scene part: a species that is never a node is no node, and is on the arrow text', () => {
  const projection = navigatorOf(DEMO, false);
  const { scene } = pipe(projection, portsOf(DEMO));

  it('has no scene node for water, and the chemistry is intact', () => {
    expect(DEMO.records.species['spc_water' as keyof typeof DEMO.records.species]).toBeDefined();
    expect(scene.nodes.some((n) => n.id === 'spc_water' || n.label.some((r) => r.text === 'Water'))).toBe(false);
  });

  it('shows it in the arrow text of a reaction that uses it', () => {
    const texts = scene.edges.map((e) => `${textOf(e.above)} ${textOf(e.below)}`);
    expect(texts.some((text) => text.includes('H2O'))).toBe(true);
  });
});

describe('ADV-033, scene part: hostile names are text', () => {
  const hostile = '<script>alert(1)</script> <img src=x onerror=alert(1)> javascript:alert(1)';
  const base = portsOf(DEMO);
  const ports: ScenePorts = { ...base, describe: (ref) => ({ name: hostile, ...(base.describe(ref)?.formula === undefined ? {} : { formula: hostile }) }) };
  const { scene } = pipe(navigatorOf(DEMO, true), ports);

  it('labels keep every character as one run', () => {
    const named = scene.nodes.filter((n) => n.glyph !== 'overflow' && n.glyph !== 'unclassified');
    expect(named.length).toBeGreaterThan(0);
    for (const n of named) expect(n.label).toEqual([{ text: hostile }]);
  });

  it('the Scene holds strings and numbers only: nothing in it can run', () => {
    const json = JSON.stringify(scene);
    expect(JSON.parse(json)).toEqual(scene);
    expect(json).not.toContain('function');
  });
});
