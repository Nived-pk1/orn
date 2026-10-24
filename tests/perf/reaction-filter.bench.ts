/**
 * The reaction filter (step 7.1a, ADR-042 E10): at the design tier (5,000 reactions) the main-thread filter must answer in 50 ms or less.
 * Three asks: the empty filter (every row and every facet), a filter with a type and a family chosen with "Only <exam version>", and a
 * substance filter; plus building the input once per state. Budgets in tests/perf/budgets-explorer.mjs.
 */
import { bench, describe } from 'vitest';
import { buildReactionFilterInput, filterReactions, type ReactionFilter } from '@/core/graph';
import { contextOf } from '@/test-support/graph-state';
import { FAST_BENCH_OPTIONS, tierState, withNavigatorAnchors } from '@/test-support/perf-kit';

for (const shape of ['dense', 'hub_explosion'] as const) {
  describe(`reaction filter (design tier, ${shape})`, () => {
    const ctx = contextOf(withNavigatorAnchors(tierState('design', shape)));
    const input = buildReactionFilterInput(ctx);
    const facets = filterReactions(input, {}, undefined).facets;
    const scope = (ref: { readonly id: string }) => (ref.id.length % 3 === 0 ? ('outside' as const) : ('official' as const));
    const narrow: ReactionFilter = { typeIds: facets.type.slice(0, 2).map((o) => o.id), fromFamilyIds: facets.fromFamily.slice(0, 3).map((o) => o.id), onlyInScope: true };
    const substance: ReactionFilter = { substanceIds: facets.substance.slice(0, 3).map((o) => o.id), usedAs: 'any', text: 'a' };
    bench('empty filter (rows and facets)', () => void filterReactions(input, {}, scope as never), FAST_BENCH_OPTIONS);
    bench('type, family and exam scope', () => void filterReactions(input, narrow, scope as never), FAST_BENCH_OPTIONS);
    bench('substance and name', () => void filterReactions(input, substance, scope as never), FAST_BENCH_OPTIONS);
    bench('build the input', () => void buildReactionFilterInput(ctx), FAST_BENCH_OPTIONS);
  });
}
