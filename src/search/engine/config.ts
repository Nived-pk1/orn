/**
 * The MiniSearch configuration (step 4.5, SEARCH §3, ADR-011): fields, boosts, how a field is cut into terms, and the fuzzy rule.
 * Nothing outside `src/search/engine/` imports minisearch (dependency-cruiser `minisearch-only-in-adapter`).
 *
 *   name, alias   boost 4, prefix search ON (the only fields it applies to), fuzzy by term length
 *   formula       boost 3, exact term, no prefix, no fuzzy (formulas and abbreviations must be exact)
 *   structure     boost 2, the trimmed text as ONE case-sensitive term, exact
 *   tags          boost 2, text boost 1: no prefix, fuzzy by term length
 * Fuzzy: edit distance 1 for terms of 5 or more characters, 2 for 9 or more, none shorter.
 */
import type { Options } from 'minisearch';
import { tokens } from '@/core/text';

export const FIELDS = ['name', 'alias', 'formula', 'structure', 'tags', 'text'] as const;
export type FieldName = (typeof FIELDS)[number];

export const BOOST: Readonly<Record<FieldName, number>> = { name: 4, alias: 4, formula: 3, structure: 2, tags: 2, text: 1 };

/** Changes whenever the options above change; a serialised index built under another value is refused (`BAD_INDEX`). */
export const CONFIG_ID = 'orn-search-config-1';

/** What MiniSearch indexes for one document: one string per field (several values joined by newlines). */
export interface MiniDoc {
  readonly id: string;
  readonly name: string;
  readonly alias: string;
  readonly formula: string;
  readonly structure: string;
  readonly tags: string;
  readonly text: string;
}

/** Edit distance allowed for a (folded) query term; `false` when none. Counts characters, not UTF-16 units. */
export function fuzzyDistance(term: string): number | false {
  const length = [...term].length;
  return length >= 9 ? 2 : length >= 5 ? 1 : false;
}

const isBlank = (value: string): boolean => value.trim() === '';

/**
 * Cuts one field into terms. Names, aliases, formulas and tags go through the core normaliser (`tokens`: folded words, adjacent
 * pairs and the whole phrase joined, so "Wolff-Kishner", "wolff kishner" and "wolffkishner" share a term). Body text is cut into
 * words first and each word normalised, which keeps the joined forms of hyphenated words and does not triple the index with
 * adjacent pairs. A structure is one term: the trimmed value, case kept.
 */
export function termsOf(value: string, field: string | undefined): string[] {
  const lines = value.split('\n');
  switch (field) {
    case 'structure':
      return lines.map((line) => line.trim()).filter((line) => line !== '');
    case 'text':
      return value.split(/\s+/).filter((word) => !isBlank(word)).flatMap((word) => tokens(word));
    default:
      return lines.filter((line) => !isBlank(line)).flatMap((line) => tokens(line));
  }
}

export const identity = (term: string): string => term;

export const MINISEARCH_OPTIONS: Options<MiniDoc> = {
  idField: 'id',
  fields: [...FIELDS],
  storeFields: [],
  tokenize: termsOf,
  processTerm: identity,
  searchOptions: { boost: { ...BOOST }, tokenize: (term) => [term], processTerm: identity, combineWith: 'OR' },
};
