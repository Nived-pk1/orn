/**
 * Differential test (docs/IMPLEMENTATION_PLAN.md §2 step 2.9): the index-backed navigator
 * (`navigatorProjection.build`, reading `ctx.indexes.navigatorRollup()`) must equal, byte-for-byte, the
 * pre-2.9 reference implementation (`navigatorReferenceBuild`, `src/test-support/navigator-reference.ts`,
 * which recomputes hub resolution from scratch on every call) — on the demo dataset, on all 6 generator
 * shapes at the tiny/initial/design tiers, and after random command sequences through the store (where
 * the roll-up's incremental maintenance, not just its initial build, is exercised).
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { navigatorProjection, type ProjectionRequest } from '@/core/graph';
import { documentToState } from '@/core/dataset';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, GENERATOR_TIERS, generateTier, type GeneratorShape, type GeneratorTier } from '@/test-support/generator';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { navigatorReferenceBuild } from '@/test-support/navigator-reference';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import type { CanonicalState } from '@/core/schema';
import type { ReadonlyIndexes } from '@/core/indexes';
import { indexEngine } from '@/core/indexes';
import { freshStore, runIntents, PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const REQUESTS: readonly Partial<ProjectionRequest>[] = [
  {},
  { limits: { ...requestOf('navigator').limits, maxNodes: 5, maxEdges: 7 } },
  { filters: { scopes: [], topicIds: [], reagentFamilies: [], text: 'a' } },
];

/**
 * `indexes` defaults to a fresh build, but the "after random command sequences" test passes the store's
 * own live, incrementally-maintained indexes instead — that is the whole point of that test.
 */
function expectSameNavigator(state: CanonicalState, indexes: ReadonlyIndexes = indexEngine.build(state)): void {
  const ctx = { ...contextOf(state), indexes };
  for (const over of REQUESTS) {
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
        expectSameNavigator(parsed.state);
      },
      tier === 'design' ? HEAVY_TIER_TIMEOUT : undefined,
    );
  }

  it('after random command sequences (incremental maintenance, not just initial build)', () => {
    // The store itself only keeps the part-1 core indexes (docs/PROGRESS.md step 2.1's open item: no
    // consumer has forced it onto the full engine yet); this test needs the full, incrementally-applied
    // `indexEngine` — kept in step alongside the store the same way P-07 (tests/property/commands.test.ts)
    // does, by subscribing and applying each ChangeSet independently.
    let commits = 0;
    fc.assert(
      fc.property(smallParamsArb, intentsArb(30), (params, intents) => {
        const initial = frozenStateOf(params);
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
