/**
 * What the navigator draws for one reaction (docs/GRAPH_SEMANTICS.md §3): the carried substrate, the
 * main products, and the filter pass. Selection follows roles and flags, never names or IDs.
 */
import { fold } from '../../text';
import { foldedNamesOf } from '../../indexes/names';
import { mainProductsOf, primarySubstrateOf, type MainProductOf } from '../../indexes/navigator-rollup';
import type { Participant, Reaction, ViewFilters } from '../../schema';
import type { ProjectionContext } from '../contracts';

/**
 * The carried-through substrate: the participant flagged `isPrimarySubstrate`, else the first reactant.
 * Spectators never qualify, and neither does a participant that is never drawn as a node (water). Thin
 * wrapper: the pure logic (step 2.9) lives in `core/indexes/navigator-rollup.ts`, which the navigator's
 * roll-up index also needs and `core/graph` can import (not the other way round).
 */
export function primarySubstrate(ctx: ProjectionContext, reaction: Reaction): Participant | undefined {
  return primarySubstrateOf(ctx.indexes, reaction);
}

export type MainProduct = MainProductOf;

/** Main products of every outcome in array order, except those never drawn as nodes. */
export function mainProducts(ctx: ProjectionContext, reaction: Reaction): MainProduct[] {
  return mainProductsOf(ctx.indexes, reaction);
}

/** Reaction IDs allowed by the topic / reagent-family filters; null = no restriction. */
export function allowedByLookup(ctx: ProjectionContext, filters: ViewFilters): ReadonlySet<string> | null {
  const { indexes } = ctx;
  let allowed: Set<string> | null = null;
  const intersect = (ids: Set<string>): void => {
    allowed = allowed === null ? ids : new Set([...allowed].filter((id) => ids.has(id)));
  };
  if (filters.topicIds.length > 0) {
    const inTopics = new Set<string>();
    for (const topic of filters.topicIds) {
      for (const ref of indexes.recordsInTopic(topic, { transitive: true })) if (ref.kind === 'reaction') inTopics.add(ref.id);
    }
    intersect(inTopics);
  }
  if (filters.reagentFamilies.length > 0) {
    intersect(new Set(filters.reagentFamilies.flatMap((family) => indexes.reactionsByReagentFamily(family))));
  }
  return allowed;
}

/** Builds the per-reaction predicate for `filters`. Filters only hide; they never change data. */
export function reactionFilter(ctx: ProjectionContext, filters: ViewFilters): (reaction: Reaction) => boolean {
  const allowed = allowedByLookup(ctx, filters);
  const scopes = new Set<string>(filters.scopes);
  const query = filters.text === undefined ? '' : fold(filters.text);
  return (reaction) => {
    if (allowed !== null && !allowed.has(reaction.id)) return false;
    if (scopes.size > 0 && !scopes.has(ctx.scopeOf({ kind: 'reaction', id: reaction.id }))) return false;
    if (query !== '' && !foldedNamesOf(reaction).some((name) => name.includes(query))) return false;
    return true;
  };
}
