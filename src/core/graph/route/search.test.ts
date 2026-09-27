/**
 * Route search (step 2.7): docs/GRAPH_SEMANTICS.md §9. Synthetic topology and ranking cases; the demo
 * dataset routes required by IMPLEMENTATION_PLAN.md §2 step 2.7 live in `search.demo.test.ts`.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, type RouteQuery, type TraversalLimits } from '..';
import type { CanonicalState } from '../../schema';
import { chemClass, cl, contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';
import { rxnId } from '@/test-support/demo/reaction-kit';
import { must } from '@/test-support/state-fixture';
import { CLASS_LEVEL_MATCH_WARNING, searchRoutes } from '.';

function query(over: Partial<RouteQuery> & Pick<RouteQuery, 'target'>): RouteQuery {
  return { maxSteps: DEFAULT_ROUTE_MAX_STEPS, maxRoutes: DEFAULT_ROUTE_MAX_ROUTES, assumption: 'side_inputs_available', limits: DEFAULT_TRAVERSAL_LIMITS, ...over };
}

const oneStep = (slug: string, from: string, to: string, sel: 'major' | 'minor' = 'major') =>
  reaction({ slug, name: slug, scope: 'specific' as const, participants: [{ ref: sp(from), role: 'reactant' }], outcomes: [{ sel, products: [{ ref: sp(to) }] }] });

describe('ADV-049: diamond A→B, A→C, B→D, C→D', () => {
  const state = stateOf(
    species('sp-a', 'A'), species('sp-b', 'B'), species('sp-c', 'C'), species('sp-d', 'D'),
    oneStep('r-ab', 'sp-a', 'sp-b'), oneStep('r-ac', 'sp-a', 'sp-c'), oneStep('r-bd', 'sp-b', 'sp-d'), oneStep('r-cd', 'sp-c', 'sp-d'),
  );
  const ctx = contextOf(state);

  it('route search returns both A→D routes; no transitive reduction, D appears once per route', () => {
    const result = searchRoutes(ctx, query({ target: sp('sp-d'), startFrom: [sp('sp-a')] }));
    expect(result.routes).toHaveLength(2);
    expect(result.routes.map((r) => r.steps.map((s) => s.reactionId))).toEqual([
      ['rxn_r-ab', 'rxn_r-bd'],
      ['rxn_r-ac', 'rxn_r-cd'],
    ]);
    expect(result.truncation).toBeNull();
  });
});

describe('ADV-050: A → B → C → A', () => {
  const state = stateOf(
    species('sp-a', 'A'), species('sp-b', 'B'), species('sp-c', 'C'),
    oneStep('r-ab', 'sp-a', 'sp-b'), oneStep('r-bc', 'sp-b', 'sp-c'), oneStep('r-ca', 'sp-c', 'sp-a'),
  );
  const ctx = contextOf(state);

  it('terminates without endless routes: each substance visited once per path, no truncation needed', () => {
    const result = searchRoutes(ctx, query({ target: sp('sp-b'), startFrom: [sp('sp-a')] }));
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]?.steps.map((s) => s.reactionId)).toEqual(['rxn_r-ab']);
    expect(result.truncation).toBeNull();
    expect(result.explored).toBeLessThan(10);
  });

  it('a tight node budget still terminates and reports truncation, never silently', () => {
    const tight: TraversalLimits = { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 1 };
    const result = searchRoutes(ctx, query({ target: sp('sp-b'), startFrom: [sp('sp-a')], limits: tight }));
    expect(result.truncation?.reason).toBe('max_nodes');
    expect(result.routes.every((r) => r.steps.length > 0)).toBe(true);
  });
});

describe('INV-22: time budget uses the injected clock (step 2.10)', () => {
  // A chain long enough for the clock to be checked repeatedly before it runs out (the same pattern
  // traverse()'s own clock test uses, traversal.test.ts), but within DEFAULT_TRAVERSAL_LIMITS.maxDepth
  // (12) so the depth clamp does not also fire and confound which truncation reason is reported.
  const n = 10;
  const chainSpecies = Array.from({ length: n + 1 }, (_, i) => species(`sp-${i}`, `S${i}`));
  const chainReactions = Array.from({ length: n }, (_, i) => oneStep(`r-${i}`, `sp-${i}`, `sp-${i + 1}`));
  const state = stateOf(...chainSpecies, ...chainReactions);
  const ctx = contextOf(state);

  it('stops the search and reports time_budget instead of exploring the whole chain', () => {
    let t = 0;
    const tight: TraversalLimits = { ...DEFAULT_TRAVERSAL_LIMITS, timeBudgetMs: 5 };
    const result = searchRoutes(ctx, query({ target: sp(`sp-${n}`), maxSteps: n, limits: tight }), { now: () => (t += 2) });
    expect(result.truncation?.reason).toBe('time_budget');
    expect(result.explored).toBeGreaterThan(0);
    expect(result.explored).toBeLessThan(n);
  });

  it('without an injected clock, the time budget is not enforced (no now, no crash, no false truncation)', () => {
    const tight: TraversalLimits = { ...DEFAULT_TRAVERSAL_LIMITS, timeBudgetMs: 5 };
    const result = searchRoutes(ctx, query({ target: sp(`sp-${n}`), maxSteps: n, limits: tight }));
    expect(result.truncation).toBeNull();
    expect(result.explored).toBe(n + 1);
  });
});

describe('P-09: route search terminates within limits on random cyclic graphs', () => {
  it('never exceeds the node budget and always returns, for any random directed graph', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 6 }),
        fc.array(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 })), { maxLength: 14 }),
        fc.integer({ min: 0, max: 5 }),
        fc.integer({ min: 0, max: 5 }),
        (n, rawEdges, targetIdx, startIdx) => {
          const nodeIds = Array.from({ length: n }, (_, i) => `n${i}`);
          const edges = new Map<string, readonly [number, number]>();
          for (const [from, to] of rawEdges) {
            if (from >= n || to >= n) continue;
            edges.set(`${from}-${to}`, [from, to]);
          }
          const species_ = nodeIds.map((id) => species(id, id));
          const reactions = [...edges.entries()].map(([key, [from, to]]) => oneStep(`e-${key}`, must(nodeIds[from]), must(nodeIds[to])));
          const state: CanonicalState = stateOf(...species_, ...reactions);
          const ctx = contextOf(state);
          const target = must(nodeIds[targetIdx % n]);
          const start = must(nodeIds[startIdx % n]);
          const tight: TraversalLimits = { ...DEFAULT_TRAVERSAL_LIMITS, maxNodes: 30, maxEdges: 60 };
          const result = searchRoutes(ctx, query({ target: sp(target), startFrom: [sp(start)], limits: tight }));
          expect(result.explored).toBeLessThanOrEqual(tight.maxNodes + 1);
          expect(result.routes.length).toBeLessThanOrEqual(DEFAULT_ROUTE_MAX_ROUTES);
          for (const route of result.routes) {
            const seen = new Set<string>();
            for (const step of route.steps) {
              expect(seen.has(step.carriedIn.id)).toBe(false);
              seen.add(step.carriedIn.id);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe('ranking (docs/GRAPH_SEMANTICS.md §9)', () => {
  it('a major route ranks above a minor route to the same target', () => {
    const state = stateOf(
      species('sp-a', 'A'), species('sp-b', 'B'), species('sp-c', 'C'),
      oneStep('r-major', 'sp-a', 'sp-c', 'major'), oneStep('r-minor', 'sp-b', 'sp-c', 'minor'),
      oneStep('r-a-to-b', 'sp-a', 'sp-b'),
    );
    const ctx = contextOf(state);
    const result = searchRoutes(ctx, query({ target: sp('sp-c') }));
    expect(result.routes[0]?.steps.map((s) => s.reactionId)).toEqual(['rxn_r-major']);
  });

  it('fewer steps outranks a longer route with better selectivity', () => {
    const state = stateOf(
      species('sp-a', 'A'), species('sp-b', 'B'), species('sp-c', 'C'),
      oneStep('r-direct', 'sp-a', 'sp-c', 'minor'), oneStep('r-a-b', 'sp-a', 'sp-b', 'major'), oneStep('r-b-c', 'sp-b', 'sp-c', 'major'),
    );
    const ctx = contextOf(state);
    const result = searchRoutes(ctx, query({ target: sp('sp-c'), startFrom: [sp('sp-a')] }));
    expect(result.routes[0]?.steps).toHaveLength(1);
    expect(result.routes[0]?.steps[0]?.reactionId).toBe('rxn_r-direct');
  });

  it('a stated route ranks above one reached only by class-membership inference, with the inferred step warned', () => {
    const fam = chemClass('fam', 'Family', 'functional_group');
    const member = species('member', 'Member', { classes: ['fam'] });
    const other = species('other', 'Other');
    const target = species('target', 'Target');
    const stated = reaction({ slug: 'stated', name: 'stated', scope: 'specific', participants: [{ ref: sp('other'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('target') }] }] });
    const generic = reaction({ slug: 'generic', name: 'generic', scope: 'generic', participants: [{ ref: cl('fam'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('target') }] }] });
    const ctx = contextOf(stateOf(fam, member, other, target, stated, generic));
    const result = searchRoutes(ctx, query({ target: sp('target') }));
    // Three routes complete at depth 1 (no startFrom): via `other` (stated), via the class itself (exact,
    // since the reactant genuinely is the class), and via `member` (inferred). Only the last is warned, and
    // it ranks last: an inferred step is strictly worse than either exact one, whichever of those sorts first.
    const statedIdx = result.routes.findIndex((r) => r.steps[0]?.carriedIn.id === 'spc_other');
    const inferredIdx = result.routes.findIndex((r) => r.steps[0]?.carriedIn.id === 'spc_member');
    expect(statedIdx).toBeGreaterThanOrEqual(0);
    expect(inferredIdx).toBe(result.routes.length - 1);
    expect(inferredIdx).toBeGreaterThan(statedIdx);
    expect(result.routes[inferredIdx]?.steps[0]?.warnings).toEqual([CLASS_LEVEL_MATCH_WARNING]);
  });

  it('ties are broken by the reaction-ID sequence, deterministically', () => {
    const state = stateOf(
      species('sp-a', 'A'), species('sp-b', 'B'), species('sp-c', 'C'),
      oneStep('r-z', 'sp-a', 'sp-c'), oneStep('r-y', 'sp-b', 'sp-c'), oneStep('r-a-b', 'sp-a', 'sp-b'), oneStep('r-a-c-2', 'sp-a', 'sp-c'),
    );
    const ctx = contextOf(state);
    const result = searchRoutes(ctx, query({ target: sp('sp-c'), startFrom: [sp('sp-a')] }));
    const oneStepRoutes = result.routes.filter((r) => r.steps.length === 1).map((r) => r.steps[0]?.reactionId);
    expect(oneStepRoutes).toEqual(['rxn_r-a-c-2', 'rxn_r-z']);
  });
});

describe('assumption: only_listed_inputs', () => {
  const state = stateOf(
    species('sp-a', 'A'), species('sp-b', 'B'), species('sp-c', 'C'), species('sp-x', 'X, an unlisted reagent'),
    reaction({ slug: 'r1', name: 'R1', scope: 'specific', participants: [{ ref: sp('sp-a'), role: 'reactant' }, { ref: sp('sp-x'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('sp-b') }] }] }),
    oneStep('r2', 'sp-b', 'sp-c'),
  );
  const ctx = contextOf(state);

  it('side_inputs_available (default): an unlisted co-reactant is assumed available', () => {
    const result = searchRoutes(ctx, query({ target: sp('sp-c'), startFrom: [sp('sp-a')] }));
    expect(result.routes).toHaveLength(1);
  });

  it('only_listed_inputs: a side input that is neither listed nor produced within the route rejects the route', () => {
    const result = searchRoutes(ctx, query({ target: sp('sp-c'), startFrom: [sp('sp-a')], assumption: 'only_listed_inputs' }));
    expect(result.routes).toEqual([]);
  });

  it('only_listed_inputs: listing the side input as a starting material admits the route', () => {
    // Listing X too makes it a second acceptable source in its own right (X → B → C), on top of A → B → C.
    const result = searchRoutes(ctx, query({ target: sp('sp-c'), startFrom: [sp('sp-a'), sp('sp-x')], assumption: 'only_listed_inputs' }));
    expect(result.routes.map((r) => r.steps[0]?.carriedIn.id).sort()).toEqual(['spc_sp-a', 'spc_sp-x']);
  });
});

describe('bookkeeping', () => {
  it('excludeReactionIds removes a reaction from every candidate route', () => {
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), oneStep('r1', 'sp-a', 'sp-b'));
    const ctx = contextOf(state);
    expect(searchRoutes(ctx, query({ target: sp('sp-b'), excludeReactionIds: [rxnId('r1')] })).routes).toEqual([]);
  });

  it('maxRoutes trims the ranked list without changing the order', () => {
    const state = stateOf(
      species('sp-a', 'A'), species('sp-b', 'B'),
      oneStep('r-a', 'sp-a', 'sp-b'), oneStep('r-b', 'sp-a', 'sp-b'), oneStep('r-c', 'sp-a', 'sp-b'),
    );
    const ctx = contextOf(state);
    const full = searchRoutes(ctx, query({ target: sp('sp-b') }));
    const trimmed = searchRoutes(ctx, query({ target: sp('sp-b'), maxRoutes: 2 }));
    expect(full.routes).toHaveLength(3);
    expect(trimmed.routes).toEqual(full.routes.slice(0, 2));
  });

  it('with no startFrom, any substance reached is an acceptable route (a shorter and a longer route both count)', () => {
    const state = stateOf(species('sp-a', 'A'), species('sp-b', 'B'), species('sp-c', 'C'), oneStep('r1', 'sp-a', 'sp-b'), oneStep('r2', 'sp-b', 'sp-c'));
    const ctx = contextOf(state);
    const result = searchRoutes(ctx, query({ target: sp('sp-c') }));
    expect(result.routes.map((r) => r.steps.map((s) => s.reactionId)).sort((a, b) => a.length - b.length)).toEqual([['rxn_r2'], ['rxn_r1', 'rxn_r2']]);
  });

  it('an unknown target has no producers and returns zero routes, not an error', () => {
    const ctx = contextOf(stateOf());
    const result = searchRoutes(ctx, query({ target: sp('sp-missing') }));
    expect(result).toEqual({ routes: [], explored: 1, truncation: null });
  });
});

describe('startFrom completion by class membership (either direction)', () => {
  it('a class in startFrom completes at a member species it is reached at, inferred and warned', () => {
    const fam = chemClass('fam', 'Family', 'functional_group');
    const member = species('member', 'Member', { classes: ['fam'] });
    const target = species('target', 'Target');
    const r = oneStep('r1', 'member', 'target');
    const ctx = contextOf(stateOf(fam, member, target, r));
    const result = searchRoutes(ctx, query({ target: sp('target'), startFrom: [cl('fam')] }));
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]?.steps[0]?.carriedIn.id).toBe('spc_member');
    expect(result.routes[0]?.steps[0]?.warnings).toEqual([CLASS_LEVEL_MATCH_WARNING]);
  });

  it('a species in startFrom completes at a class it is reached at (the class itself is the exact reactant), inferred and warned', () => {
    const fam = chemClass('fam', 'Family', 'functional_group');
    const member = species('member', 'Member', { classes: ['fam'] });
    const target = species('target', 'Target');
    const generic = reaction({ slug: 'generic', name: 'generic', scope: 'generic', participants: [{ ref: cl('fam'), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp('target') }] }] });
    const ctx = contextOf(stateOf(fam, member, target, generic));
    const result = searchRoutes(ctx, query({ target: sp('target'), startFrom: [sp('member')] }));
    // Two routes complete: carriedIn = the class itself (completion is the inferred hop, checked here) and
    // carriedIn = `member` directly (an exact startFrom match — the *move* into it was the inferred hop
    // instead, tested by the class-membership-inference case in moves.test.ts). Both end up warned.
    const viaClass = result.routes.find((r) => r.steps[0]?.carriedIn.kind === 'class');
    expect(viaClass?.steps[0]?.carriedIn).toEqual({ kind: 'class', id: 'cls_fam' });
    expect(viaClass?.steps[0]?.warnings).toEqual([CLASS_LEVEL_MATCH_WARNING]);
    expect(result.routes.map((r) => r.steps[0]?.carriedIn.id).sort()).toEqual(['cls_fam', 'spc_member']);
  });
});
