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

/** The dimensions a facet counts one by one. From and To family are coupled (one candidate holds both) and are handled together. */
const DIMENSIONS = ['substance', 'type', 'namedReaction', 'reviewStatus'] as const;
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
    case 'type':
      return entry.typeIds;
    case 'namedReaction':
      return entry.namedReactionIds;
    case 'reviewStatus':
      return [entry.status];
  }
}

/**
 * From and To family (7.1b C2): with both chosen the entry needs ONE candidate with its from in From AND its to in To; with one chosen,
 * any candidate. `fromOptions` / `toOptions` are what the entry offers the two facets: a from option counts the reaction when it pairs with
 * a chosen To (any To when none is chosen), and the same the other way round, so a facet equals the result with that option chosen.
 */
function pairsOfEntry(entry: ReactionFilterEntry, from: ReadonlySet<string> | undefined, to: ReadonlySet<string> | undefined) {
  const matches = entry.pairs.filter((pair) => (from === undefined || from.has(pair[0])) && (to === undefined || to.has(pair[1])));
  return { matches: matches.length > 0, fromOptions: entry.pairs.filter((pair) => to === undefined || to.has(pair[1])).map((pair) => pair[0]), toOptions: entry.pairs.filter((pair) => from === undefined || from.has(pair[0])).map((pair) => pair[1]) };
}

export function filterReactions(input: ReactionFilterInput, filter: ReactionFilter, scope: ScopeOf | undefined): ReactionFilterResult {
  const usedAs = filter.usedAs ?? 'any';
  const chosen: Record<Dimension, readonly string[]> = {
    substance: filter.substanceIds ?? [],
    type: filter.typeIds ?? [],
    namedReaction: filter.namedReactionIds ?? [],
    reviewStatus: filter.reviewStatuses ?? [],
  };
  const fromSet = filter.fromFamilyIds === undefined || filter.fromFamilyIds.length === 0 ? undefined : new Set(filter.fromFamilyIds);
  const toSet = filter.toFamilyIds === undefined || filter.toFamilyIds.length === 0 ? undefined : new Set(filter.toFamilyIds);
  const text = fold(filter.text ?? '').trim();
  const hide = filter.onlyInScope === true && scope !== undefined;

  const counts = Object.fromEntries([...DIMENSIONS, 'fromFamily', 'toFamily'].map((dimension) => [dimension, new Map<string, number>()])) as Record<Dimension | 'fromFamily' | 'toFamily', Map<string, number>>;
  const rows: ReactionFilterRow[] = [];
  let hiddenByScope = 0;

  for (const entry of input.entries) {
    const outside = scope !== undefined && scope({ kind: 'reaction', id: entry.id } as never) === 'outside';
    const failed: Dimension[] = [];
    for (const dimension of DIMENSIONS) {
      const wanted = chosen[dimension];
      if (wanted.length === 0) continue;
      if (!hasAny(wanted, optionsOf(entry, dimension, usedAs) as readonly string[] | ReadonlySet<string>)) failed.push(dimension);
    }
    const geo = pairsOfEntry(entry, fromSet, toSet);
    const geoFails = !geo.matches;
    const textFails = text !== '' && !entry.folded.includes(text);
    const scopeFails = hide && outside;
    if (!textFails && failed.length === 0 && !geoFails && scopeFails) hiddenByScope += 1;
    if (scopeFails || textFails) continue; // the name box and the exam scope apply to every facet
    // a facet counts an entry that passes everything but that facet's own choice (From and To: the pair rule makes its options)
    for (const dimension of DIMENSIONS) {
      if (geoFails || failed.some((one) => one !== dimension)) continue;
      for (const option of optionsOf(entry, dimension, usedAs)) counts[dimension].set(option, (counts[dimension].get(option) ?? 0) + 1);
    }
    if (failed.length === 0) {
      for (const option of new Set(geo.fromOptions)) counts.fromFamily.set(option, (counts.fromFamily.get(option) ?? 0) + 1);
      for (const option of new Set(geo.toOptions)) counts.toFamily.set(option, (counts.toFamily.get(option) ?? 0) + 1);
    }
    if (failed.length === 0 && !geoFails) rows.push({ id: entry.id, name: entry.name, fromFamilyIds: entry.fromFamilyIds, toFamilyIds: entry.toFamilyIds, outside, typeIds: entry.typeIds });
  }

  const facet = (dimension: Dimension | 'fromFamily' | 'toFamily', picked: readonly string[]): FacetOption[] => {
    const map = counts[dimension];
    for (const id of picked) if (!map.has(id)) map.set(id, 0); // a selected option is shown, with 0
    return [...map].map(([id, count]) => ({ id, count })).sort((a, b) => compare(a.id, b.id));
  };
  const facets: ReactionFacets = {
    substance: facet('substance', chosen.substance),
    fromFamily: facet('fromFamily', filter.fromFamilyIds ?? []),
    toFamily: facet('toFamily', filter.toFamilyIds ?? []),
    type: facet('type', chosen.type),
    namedReaction: facet('namedReaction', chosen.namedReaction),
    reviewStatus: facet('reviewStatus', chosen.reviewStatus),
  };
  return { rows, total: input.entries.length, hiddenByScope, facets };
}
