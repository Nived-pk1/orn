/**
 * Navigator: nothing is dropped (step 5.4c; INV-22, CLAUDE.md §1.5). For every request, the totals of the drawn
 * pairs plus the candidates of the pairs that are not drawn (`truncation.hiddenEdges`, null truncation = none)
 * equal the candidates that pass the request's filters, counted here by an independent scan. The same runs check
 * the limits (nodes, edges), that `hidden` on the nodes adds up to the hidden candidates, and that a bundle never
 * claims fewer arrows than it draws.
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { navigatorProjection, UNCLASSIFIED_HUB_ID, type Projection, type ProjectionRequest } from '@/core/graph';
import { mainProducts, primarySubstrate, reactionFilter } from '@/core/graph/navigator/select';
import type { CanonicalState } from '@/core/schema';
import { frozenStateOf, smallParamsArb } from '@/test-support/arbitraries';
import { contextOf, requestOf } from '@/test-support/graph-state';
import { withNavigatorAnchors } from '@/test-support/perf-kit';
import { PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

/** The candidates (reaction, outcome, main product) that pass the filters: an independent scan of the reactions. */
function filteredCandidates(state: CanonicalState, request: ProjectionRequest): number {
  const ctx = contextOf(state);
  const passes = reactionFilter(ctx, request.filters);
  let count = 0;
  for (const reaction of Object.values(state.records.reaction)) {
    if (!passes(reaction) || primarySubstrate(ctx, reaction) === undefined) continue;
    count += mainProducts(ctx, reaction).length;
  }
  return count;
}

/** Arrows the projection accounts for as drawn pairs: a bundle's total, or one for an edge that is no bundle. */
function drawnTotals(p: Projection): number {
  const bundled = new Set(p.bundles.flatMap((bundle) => bundle.edgeIds));
  return p.bundles.reduce((sum, bundle) => sum + bundle.total, 0) + p.edges.filter((e) => e.semantic === 'transforms_to' && !bundled.has(e.id)).length;
}

/** A random request;  maps a number to a hub of the state, Unclassified, or an ID that names no hub. */
const requestArb = fc.record({
  maxNodes: fc.constantFrom(1, 2, 3, 6, 12, 400),
  maxEdges: fc.constantFrom(1, 2, 3, 5, 9, 30, 800),
  text: fc.constantFrom('', '', 'a', 'reaction', 'model', 'zzz'),
  entries: fc.array(fc.record({ pick: fc.nat(40), direction: fc.constantFrom('out' as const, 'in' as const, 'both' as const) }), { maxLength: 8 }),
});

describe('navigator: nothing is dropped', () => {
  it('drawn totals + hidden candidates = filtered candidates, within the limits, for random states and requests', () => {
    let truncated = 0;
    let expanded = 0;
    fc.assert(
      fc.property(smallParamsArb, fc.integer({ min: 2, max: 6 }), fc.array(requestArb, { minLength: 4, maxLength: 10 }), (params, anchors, requests) => {
        const state = withNavigatorAnchors(frozenStateOf(params), anchors);
        const hubs = [...Object.values(state.records.navigator_anchor).map((anchor) => anchor.target.id).sort(), UNCLASSIFIED_HUB_ID, 'cls_nowhere'];
        for (const raw of requests) {
          const request = requestOf('navigator', {
            limits: { ...requestOf('navigator').limits, maxNodes: raw.maxNodes, maxEdges: raw.maxEdges },
            filters: { scopes: [], topicIds: [], reagentFamilies: [], ...(raw.text === '' ? {} : { text: raw.text }) },
            expansion: { expanded: raw.entries.map((e) => ({ nodeId: hubs[e.pick % hubs.length] as string, direction: e.direction })), collapsedEdgeIds: [] },
          });
          const p = navigatorProjection.build(contextOf(state), request);
          const hiddenEdges = p.truncation?.hiddenEdges ?? 0;
          expect(drawnTotals(p) + hiddenEdges).toBe(filteredCandidates(state, request));
          expect(p.nodes.length).toBeLessThanOrEqual(raw.maxNodes);
          expect(p.edges.length).toBeLessThanOrEqual(raw.maxEdges);
          for (const bundle of p.bundles) expect(bundle.total).toBeGreaterThanOrEqual(Math.max(2, bundle.edgeIds.length));
          // A hidden candidate is counted at each end that is shown: at most twice, and never more than the hidden ones.
          const hiddenOnNodes = p.nodes.filter((n) => n.role !== 'overflow').reduce((sum, n) => sum + n.hidden.outgoing + n.hidden.incoming, 0);
          expect(hiddenOnNodes).toBeLessThanOrEqual(2 * hiddenEdges);
          if (p.truncation !== null) truncated += 1;
          if (p.nodes.some((n) => n.role === 'member')) expanded += 1;
        }
      }),
      PARAMS,
    );
    expect(truncated).toBeGreaterThan(20);
    expect(expanded).toBeGreaterThan(20);
  });
});
