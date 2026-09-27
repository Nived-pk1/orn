/**
 * Route search against the real demo dataset (docs/IMPLEMENTATION_PLAN.md §2 step 2.7): the curated
 * ethanol → propan-2-ol and aniline → phenol routes (docs/TEST_STRATEGY.md §3 "Routes") are found by
 * search alone, plus the PCC/dichromate alternative for the first; ethanol → ethanoic acid returns both
 * the direct oxidation and the two-step route via ethanal. Order is not asserted here (that is
 * `search.test.ts`'s "ranking" suite) — only that every expected path is found, and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { contextOf, sp } from '@/test-support/graph-state';
import { buildDemoDocument } from '@/test-support/demo';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, type FoundRoute, type RouteQuery } from '..';
import { searchRoutes } from '.';

function demoState(): CanonicalState {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
  return parsed.state;
}

function query(over: Partial<RouteQuery> & Pick<RouteQuery, 'target' | 'startFrom'>): RouteQuery {
  return { maxSteps: DEFAULT_ROUTE_MAX_STEPS, maxRoutes: DEFAULT_ROUTE_MAX_ROUTES, assumption: 'side_inputs_available', limits: DEFAULT_TRAVERSAL_LIMITS, ...over };
}

const reactionIdsOf = (route: FoundRoute): string[] => route.steps.map((s) => s.reactionId);

describe('demo dataset routes', () => {
  const ctx = contextOf(demoState());

  it('ethanol → propan-2-ol: the curated PCC route, plus the dichromate alternative found by route search', () => {
    const result = searchRoutes(ctx, query({ target: sp('propan-2-ol'), startFrom: [sp('ethanol')] }));
    const found = result.routes.map(reactionIdsOf);
    expect(found).toHaveLength(2);
    expect(found).toContainEqual(['rxn_ethanol-to-ethanal-pcc', 'rxn_methylmgbr-ethanal']);
    expect(found).toContainEqual(['rxn_ethanol-to-ethanal-dichromate', 'rxn_methylmgbr-ethanal']);
    expect(result.routes.every((r) => r.steps.every((s) => s.warnings.length === 0))).toBe(true);
    expect(result.truncation).toBeNull();
  });

  it('aniline → phenol: diazotisation, then hydrolysis of the diazonium salt', () => {
    const result = searchRoutes(ctx, query({ target: sp('phenol'), startFrom: [sp('aniline')] }));
    expect(result.routes.map(reactionIdsOf)).toEqual([['rxn_aniline-diazotisation', 'rxn_benzenediazonium-to-phenol']]);
    expect(result.truncation).toBeNull();
  });

  it('ethanol → ethanoic acid: returns both the direct path and the path via ethanal', () => {
    const result = searchRoutes(ctx, query({ target: sp('ethanoic-acid'), startFrom: [sp('ethanol')] }));
    const found = result.routes.map(reactionIdsOf);
    expect(found).toHaveLength(3);
    expect(found).toContainEqual(['rxn_ethanol-to-ethanoic-acid']);
    expect(found).toContainEqual(['rxn_ethanol-to-ethanal-pcc', 'rxn_ethanal-to-ethanoic-acid']);
    expect(found).toContainEqual(['rxn_ethanol-to-ethanal-dichromate', 'rxn_ethanal-to-ethanoic-acid']);
    // The direct route is one step, so it outranks both two-step routes regardless of the tie-break rule.
    expect(result.routes[0]?.steps).toHaveLength(1);
    expect(result.truncation).toBeNull();
  });

  it('a target with no producers in the demo dataset returns zero routes, not an error', () => {
    const result = searchRoutes(ctx, query({ target: sp('methylmagnesium-bromide'), startFrom: [sp('ethanol')] }));
    expect(result.routes).toEqual([]);
    expect(result.truncation).toBeNull();
  });
});
