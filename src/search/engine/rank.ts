/**
 * Ranking, filters and hits (step 4.5, SEARCH §3). The order of a result list is a TOTAL order, so the same query over the same
 * documents always gives the same list, whatever order the documents were added in:
 *   1. score, highest first (rounded to 9 decimals: MiniSearch's BM25 averages drift by a few ulps with the add/remove history, and
 *      the rounding makes an incrementally maintained index and a freshly built one agree);
 *   2. the rank of the document's scope under the query's exam version, best first (official, prerequisite, enrichment, outside,
 *      then unranked) — only when the query names a version;
 *   3. published before draft;
 *   4. the folded title, then the id.
 */
import type { SearchResult } from 'minisearch';
import { fold, tokens } from '@/core/text';
import { SCOPE_NAMES, UNRANKED, type SearchDocument, type SearchHit, type SearchQuery } from '../contracts';

export interface Entry {
  readonly doc: SearchDocument;
  /** `fold(title)`, computed once when the document is added. */
  readonly folded: string;
}

export const roundScore = (score: number): number => Math.round(score * 1e9) / 1e9;

const scopeRank = (entry: Entry, examVersionId: string | undefined): number =>
  examVersionId === undefined ? 0 : (entry.doc.scopeRanks[examVersionId] ?? UNRANKED);

export interface Candidate {
  readonly entry: Entry;
  readonly score: number;
  readonly match: SearchResult['match'];
}

export function compareCandidates(a: Candidate, b: Candidate, examVersionId: string | undefined): number {
  if (a.score !== b.score) return b.score - a.score;
  const byScope = scopeRank(a.entry, examVersionId) - scopeRank(b.entry, examVersionId);
  if (byScope !== 0) return byScope;
  const byLifecycle = Number(a.entry.doc.lifecycle === 'draft') - Number(b.entry.doc.lifecycle === 'draft');
  if (byLifecycle !== 0) return byLifecycle;
  if (a.entry.folded !== b.entry.folded) return a.entry.folded < b.entry.folded ? -1 : 1;
  return a.entry.doc.id < b.entry.doc.id ? -1 : a.entry.doc.id > b.entry.doc.id ? 1 : 0;
}

const anyOf = (wanted: readonly string[] | undefined, have: readonly string[]): boolean =>
  wanted === undefined || wanted.length === 0 || wanted.some((value) => have.includes(value));

/** Kind and facet filters; see `SearchQuery.facets`. */
export function filterOf(query: SearchQuery): (entry: Entry) => boolean {
  const kinds = query.kinds === undefined || query.kinds.length === 0 ? undefined : new Set<string>(query.kinds);
  const facets = query.facets;
  return ({ doc }) => {
    if (kinds !== undefined && !kinds.has(doc.kind)) return false;
    if (facets === undefined) return true;
    if (!anyOf(facets.reagentFamilies, doc.facets.reagentFamilies) || !anyOf(facets.topicIds, doc.facets.topicIds)) return false;
    if (facets.reviewStatus !== undefined && facets.reviewStatus !== doc.facets.reviewStatus) return false;
    if (facets.scopes !== undefined && facets.scopes.length > 0) {
      if (query.examVersionId === undefined) return anyOf(facets.scopes, doc.facets.scopes);
      const rank = doc.scopeRanks[query.examVersionId];
      return facets.scopes.includes(rank === undefined ? 'unmapped' : (SCOPE_NAMES[rank] as string));
    }
    return true;
  };
}

type Field = SearchHit['matchedField'];
const FIELD_OF: Readonly<Record<string, Field>> = { name: 'name', alias: 'alias', formula: 'formula', structure: 'structure', tags: 'tag', text: 'text' };
const PRIORITY: readonly Field[] = ['name', 'alias', 'formula', 'structure', 'tag', 'text'];

const firstWithTerm = (values: readonly string[], terms: ReadonlySet<string>): string | undefined =>
  values.find((value) => tokens(value).some((token) => terms.has(token)));

/** The field a hit matched (name before alias before formula, structure, tag, text) and the original text that matched. */
export function describeMatch(doc: SearchDocument, match: SearchResult['match']): Pick<SearchHit, 'matchedField' | 'matchedText'> {
  const fields = new Set<Field>();
  const byField = new Map<Field, Set<string>>();
  for (const [term, names] of Object.entries(match)) {
    for (const name of names) {
      const field = FIELD_OF[name];
      if (field === undefined) continue;
      fields.add(field);
      (byField.get(field) ?? byField.set(field, new Set()).get(field))?.add(term);
    }
  }
  const matchedField = PRIORITY.find((field) => fields.has(field));
  if (matchedField === undefined) return { matchedField: 'name' };
  const terms = byField.get(matchedField) as ReadonlySet<string>;
  const text =
    matchedField === 'name'
      ? firstWithTerm(doc.names, terms)
      : matchedField === 'alias'
        ? firstWithTerm(doc.aliases, terms)
        : matchedField === 'tag'
          ? firstWithTerm(doc.tags, terms)
          : matchedField === 'formula'
            ? firstWithTerm([doc.formula ?? '', doc.derivedFormula ?? ''].filter((value) => value !== ''), terms)
            : matchedField === 'structure'
              ? doc.structureText
              : undefined;
  return text === undefined ? { matchedField } : { matchedField, matchedText: text };
}

export const foldedTitle = (doc: SearchDocument): string => fold(doc.title);
