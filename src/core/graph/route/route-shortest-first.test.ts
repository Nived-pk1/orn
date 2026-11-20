/** Shortest routes first (step C4): a one-step route survives a bushy sibling branch that alone exceeds the node budget. */
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, searchRoutes, type RouteQuery } from '@/core/graph';
import { contextOf, reaction, sp, species, stateOf } from '@/test-support/graph-state';

const query = (over: Partial<RouteQuery> & Pick<RouteQuery, 'target'>): RouteQuery => ({ maxSteps: DEFAULT_ROUTE_MAX_STEPS, maxRoutes: DEFAULT_ROUTE_MAX_ROUTES, assumption: 'side_inputs_available', limits: DEFAULT_TRAVERSAL_LIMITS, ...over });
const step = (slug: string, from: string, to: string) =>
  reaction({ slug, name: slug, scope: 'specific' as const, participants: [{ ref: sp(from), role: 'reactant' }], outcomes: [{ sel: 'major', products: [{ ref: sp(to) }] }] });

describe('the shortest route survives a bushy sibling', () => {
  it('a one-step route is found although an earlier branch alone exceeds the node budget', () => {
    const records = [species('target', 'Target'), species('bush', 'Bush'), species('zstart', 'Start'), step('a-bush', 'bush', 'target'), step('z-direct', 'zstart', 'target')];
    // a tree three levels deep under `bush`: 25 * 25 = 625 producers, more than the 400-node budget
    for (let i = 0; i < 25; i += 1) {
      records.push(species(`m${i}`, `M${i}`), step(`a-m${i}`, `m${i}`, 'bush'));
      for (let j = 0; j < 25; j += 1) records.push(species(`n${i}x${j}`, `N${i}.${j}`), step(`a-n${i}x${j}`, `n${i}x${j}`, `m${i}`));
    }
    const ctx = contextOf(stateOf(...records));
    const result = searchRoutes(ctx, query({ target: sp('target'), startFrom: [sp('zstart')] }));
    expect(result.routes.map((r) => r.steps.map((s) => s.reactionId))).toContainEqual(['rxn_z-direct']); // a truncation notice is fine; losing the best route is not
  });
});
