/**
 * `filterReactions` (step 7.1a, ADR-042 E2-E5): the reactions that match a filter, the total, how many the exam scope hides, and the facets.
 * One pass over the entries: each entry is checked against every dimension; an entry that fails NO dimension is a result row and counts for
 * every facet; an entry that fails exactly ONE facet dimension counts for that dimension's facet only (that dimension's own choice is ignored
 * for its own counts, E4); an entry that fails only the exam scope is the hidden count. Pure and deterministic.
 */
import { fold } from '../../text/normalizer';
import type { ScopeOf } from '../scope';
import type { ReactionFilterEntry, ReactionFilterInput } from './input';
import type { FacetOption, ReactionFacets, ReactionFilter, ReactionFilterResult, ReactionFilterRow } from './types';

const DIMENSIONS = ['substance', 'fromFamily', 'toFamily', 'type', 'namedReaction', 'reviewStatus'] as const;
type Dimension = (typeof DIMENSIONS)[number];

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const hasAny = (wanted: readonly string[], have: readonly string[] | ReadonlySet<string>): boolean => {
  const set = have instanceof Set ? have : new Set(have as readonly string[]);
  return wanted.some((id) => set.has(id));
};

/** The options of a dimension an entry offers (for the facets). */
function optionsOf(entry: ReactionFilterEntry, dimension: Dimension, usedAs: NonNullable<ReactionFilter['usedAs']>): Iterable<string> {
  switch (dimension) {
    case 'substance':
      return usedAs === 'reactant' ? entry.reactants : usedAs === 'arrow' ? entry.arrow : usedAs === 'product' ? entry.products : entry.any;
    case 'fromFamily':
      return entry.fromFamilyIds;
    case 'toFamily':
      return entry.toFamilyIds;
    case 'type':
      return entry.typeIds;
    case 'namedReaction':
      return entry.namedReactionIds;
    case 'reviewStatus':
      return [entry.status];
  }
}

export function filterReactions(input: ReactionFilterInput, filter: ReactionFilter, scope: ScopeOf | undefined): ReactionFilterResult {
  const usedAs = filter.usedAs ?? 'any';
  const chosen: Record<Dimension, readonly string[]> = {
    substance: filter.substanceIds ?? [],
    fromFamily: filter.fromFamilyIds ?? [],
    toFamily: filter.toFamilyIds ?? [],
    type: filter.typeIds ?? [],
    namedReaction: filter.namedReactionIds ?? [],
    reviewStatus: filter.reviewStatuses ?? [],
  };
  const text = fold(filter.text ?? '').trim();
  const hide = filter.onlyInScope === true && scope !== undefined;

  const counts = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, new Map<string, number>()])) as Record<Dimension, Map<string, number>>;
  const rows: ReactionFilterRow[] = [];
  let hiddenByScope = 0;

  for (const entry of input.entries) {
    const outside = scope !== undefined && scope({ kind: 'reaction', id: entry.id } as never) === 'outside';
    let failedFacet: Dimension | null = null;
    let failures = 0; // facet dimensions and the name text
    for (const dimension of DIMENSIONS) {
      const wanted = chosen[dimension];
      if (wanted.length === 0) continue;
      if (hasAny(wanted, optionsOf(entry, dimension, usedAs) as readonly string[] | ReadonlySet<string>)) continue;
      failures += 1;
      failedFacet = dimension;
    }
    if (text !== '' && !entry.folded.includes(text)) {
      failures += 1;
      failedFacet = null;
    }
    const scopeFails = hide && outside;
    if (failures === 0 && scopeFails) hiddenByScope += 1;
    if (scopeFails || failures > 1) continue;
    if (failures === 1 && failedFacet === null) continue; // failed the name only: no facet counts it
    for (const dimension of DIMENSIONS) {
      if (failures === 1 && dimension !== failedFacet) continue;
      for (const option of optionsOf(entry, dimension, usedAs)) counts[dimension].set(option, (counts[dimension].get(option) ?? 0) + 1);
    }
    if (failures === 0) rows.push({ id: entry.id, name: entry.name, fromFamilyIds: entry.fromFamilyIds, toFamilyIds: entry.toFamilyIds, outside, typeIds: entry.typeIds });
  }

  const facet = (dimension: Dimension): FacetOption[] => {
    const map = counts[dimension];
    for (const id of chosen[dimension]) if (!map.has(id)) map.set(id, 0); // a selected option is shown, with 0
    return [...map].map(([id, count]) => ({ id, count })).sort((a, b) => compare(a.id, b.id));
  };
  const facets: ReactionFacets = {
    substance: facet('substance'),
    fromFamily: facet('fromFamily'),
    toFamily: facet('toFamily'),
    type: facet('type'),
    namedReaction: facet('namedReaction'),
    reviewStatus: facet('reviewStatus'),
  };
  return { rows, total: input.entries.length, hiddenByScope, facets };
}
