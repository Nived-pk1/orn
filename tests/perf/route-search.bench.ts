/**
 * Route search (docs/GRAPH_SEMANTICS.md §9, docs/PERFORMANCE_ARCHITECTURE.md §2 "projection build" budget
 * — route search has no budget row of its own; it is bounded the same way, by `TraversalLimits`).
 * Design-tier `dense` (branching) and `chain` (depth) shapes.
 */
import { bench, describe } from 'vitest';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, searchRoutes, type RouteQuery } from '@/core/graph';
import type { SpeciesId } from '@/core/schema';
import { contextOf } from '@/test-support/graph-state';
import { buildIndexes, mostReferencedSpecies, tierState } from '@/test-support/perf-kit';

for (const shape of ['dense', 'chain'] as const) {
  describe(`route search (design tier, ${shape})`, () => {
    const state = tierState('design', shape);
    const indexes = buildIndexes(state);
    const hub = mostReferencedSpecies(state, indexes);
    const ctx = contextOf(state);
    const query: RouteQuery = {
      target: { kind: 'species', id: hub.id as SpeciesId },
      maxSteps: DEFAULT_ROUTE_MAX_STEPS,
      maxRoutes: DEFAULT_ROUTE_MAX_ROUTES,
      assumption: 'side_inputs_available',
      limits: DEFAULT_TRAVERSAL_LIMITS,
    };

    bench('searchRoutes to the hub, no startFrom (any source)', () => {
      searchRoutes(ctx, query);
    });
  });
}
