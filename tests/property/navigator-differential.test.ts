/**
 * Differential test (docs/IMPLEMENTATION_PLAN.md §2 step 2.9): the index-backed navigator
 * (`navigatorProjection.build`, reading `ctx.indexes.navigatorRollup()`) must equal, byte-for-byte, the
 * independent full-scan reference (`navigatorReferenceBuild`, `src/test-support/navigator-reference.ts`,
 * which recomputes hub resolution from scratch on every call) — on the demo dataset, on all 6 generator
 * shapes at the tiny/initial/design tiers, and after random command sequences through the store (where
 * the roll-up's incremental maintenance, not just its initial build, is exercised).
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { navigatorProjection, UNCLASSIFIED_HUB_ID, type ProjectionRequest } from '@/core/graph';
import { documentToState } from '@/core/dataset';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, GENERATOR_TIERS, generateTier, type GeneratorShape, type GeneratorTier } from '@/test-support/generator';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { navigatorReferenceBuild } from '@/test-support/navigator-reference';
import { withNavigatorAnchors } from '@/test-support/perf-kit';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import type { CanonicalState } from '@/core/schema';
import type { ReadonlyIndexes } from '@/core/indexes';
import { indexEngine } from '@/core/indexes';
import { freshStore, runIntents, PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const limitsOf = (maxNodes: number, maxEdges: number): ProjectionRequest['limits'] => ({ ...requestOf('navigator').limits, maxNodes, maxEdges });
const expandedOf = (entries: readonly (readonly [string, 'out' | 'in' | 'both'])[]): ProjectionRequest['expansion'] => ({
  expanded: entries.map(([nodeId, direction]) => ({ nodeId, direction })),
  collapsedEdgeIds: [],
});

/**
 * The requests every state is compared on (step 5.4c): the old three, the per-pair limits, and hub expansion
 * built from the state's own hubs (one hub, every hub in each direction, under roomy and under tight budgets).
 */
function requestsFor(indexes: ReadonlyIndexes): readonly Partial<ProjectionRequest>[] {
  const hubs = [...new Set(indexes.anchors().map((anchor) => anchor.target.id))].filter((id) => indexes.get(id) !== undefined).sort();
  const all = [...hubs, UNCLASSIFIED_HUB_ID];
  const first = all[0] as string;
  return [
    {},
    { limits: limitsOf(5, 7) },
    { limits: limitsOf(400, 30) },
    { filters: { scopes: [], topicIds: [], reagentFamilies: [], text: 'a' } },
    { expansion: expandedOf([[first, 'both']]) },
    { expansion: expandedOf(all.map((id) => [id, 'both'] as const)) },
    { expansion: expandedOf(all.map((id) => [id, 'out'] as const)), limits: limitsOf(60, 100) },
    { expansion: expandedOf(all.map((id) => [id, 'in'] as const)), limits: limitsOf(20, 800) },
    { expansion: expandedOf(all.map((id) => [id, 'both'] as const)), limits: limitsOf(400, 12) },
    { expansion: expandedOf(all.map((id) => [id, 'both'] as const)), filters: { scopes: [], topicIds: [], reagentFamilies: [], text: 'a' } },
  ];
}

/**
 * `indexes` defaults to a fresh build, but the "after random command sequences" test passes the store's
 * own live, incrementally-maintained indexes instead — that is the whole point of that test.
 */
function expectSameNavigator(state: CanonicalState, indexes: ReadonlyIndexes = indexEngine.build(state)): void {
  const ctx = { ...contextOf(state), indexes };
  for (const over of requestsFor(indexes)) {
    const request = requestOf('navigator', over);
    expect(navigatorProjection.build(ctx, request)).toEqual(navigatorReferenceBuild(ctx, request));
  }
}

const HEAVY_TIER_TIMEOUT = 120_000;

describe('navigator: index-backed build equals the pre-2.9 reference (differential)', () => {
  it('the demo dataset', () => {
    const parsed = documentToState(buildDemoDocument());
    if (!parsed.ok) throw new Error('duplicate IDs');
    expectSameNavigator(parsed.state);
  });

  for (const tier of GENERATOR_TIERS.filter((t): t is Exclude<GeneratorTier, 'stress'> => t !== 'stress')) {
    it.each(GENERATOR_SHAPES)(
      `${tier} tier, %s`,
      (shape: GeneratorShape) => {
        const parsed = documentToState(generateTier(tier, shape, 42));
        if (!parsed.ok) throw new Error('duplicate IDs');
        // The generator makes no anchors: compare the unanchored state (everything on Unclassified) and one with
        // 60 anchored hubs (the step 5.0 fact-sheet configuration), so expansion meets real hubs.
        expectSameNavigator(parsed.state);
        expectSameNavigator(withNavigatorAnchors(parsed.state));
      },
      tier === 'design' ? HEAVY_TIER_TIMEOUT : undefined,
    );
  }

  it('the expansion requests are not vacuous: members, overflow nodes and member pairs appear', () => {
    const parsed = documentToState(generateTier('initial', 'dense', 42));
    if (!parsed.ok) throw new Error('duplicate IDs');
    const state = withNavigatorAnchors(parsed.state);
    const all = expandedOf([...new Set(state.records.navigator_anchor === undefined ? [] : Object.values(state.records.navigator_anchor).map((a) => a.target.id))].map((id) => [id, 'both'] as const));
    const p = navigatorProjection.build(contextOf(state), requestOf('navigator', { expansion: all }));
    expect(p.nodes.filter((n) => n.role === 'member').length).toBeGreaterThan(20);
    expect(p.nodes.filter((n) => n.role === 'overflow').length).toBeGreaterThan(0);
    expect(p.edges.some((e) => e.semantic === 'transforms_to' && e.from.startsWith('spc_') && e.to.startsWith('spc_'))).toBe(true);
  });

  it('after random command sequences (incremental maintenance, not just initial build)', () => {
    // The store itself only keeps the part-1 core indexes (docs/PROGRESS.md step 2.1's open item: no
    // consumer has forced it onto the full engine yet); this test needs the full, incrementally-applied
    // `indexEngine` — kept in step alongside the store the same way P-07 (tests/property/commands.test.ts)
    // does, by subscribing and applying each ChangeSet independently.
    let commits = 0;
    fc.assert(
      fc.property(smallParamsArb, intentsArb(30), (params, intents) => {
        const initial = withNavigatorAnchors(frozenStateOf(params), 6);
        const { store, ctx } = freshStore(initial);
        let full: ReadonlyIndexes = indexEngine.build(initial, store.getRevision());
        store.subscribe((changes) => {
          full = indexEngine.apply(full, changes, store.getState());
        });
        commits += runIntents(store, intents, ctx).filter((s) => s.result?.ok).length;
        expectSameNavigator(store.getState(), full);
        for (let i = 0; i < 3 && store.canUndo(); i += 1) {
          store.undo();
          expectSameNavigator(store.getState(), full);
        }
      }),
      PARAMS,
    );
    expect(commits).toBeGreaterThan(20);
  });
});
