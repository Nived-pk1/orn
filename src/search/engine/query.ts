/**
 * A `SearchQuery` text as a MiniSearch query tree (step 4.5, SEARCH §2 and §3). The text is cut into raw words; each raw word
 * becomes its folded parts ("Wolff-Kishner" is wolff + kishner; "C₂H₅OH" is c2h5oh). Every part is looked up in three groups
 * with different rules, because prefix search is for names only and formulas must be exact:
 *   names  (name, alias)   prefix on, fuzzy by length
 *   exact  (formula)       no prefix, no fuzzy
 *   body   (tags, text)    no prefix, fuzzy by length
 * and the whole raw word is also looked up as a structure (exact, case kept).
 * A word with several parts is: its joined form OR all its parts. All raw words must be found (AND); when there are several
 * parts in all, their joined form is an alternative to the whole AND, so "wolff kishner" finds a record named "Wolffkishner".
 * A joined form is looked up in names and aliases only (that is where joined terms are indexed), with prefix and without fuzzy.
 */
import type { Query, QueryCombination } from 'minisearch';
import { fold } from '@/core/text';
import { MAX_QUERY_WORDS } from '../contracts';
import { fuzzyDistance, identity } from './config';

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}+-]+|[^\p{L}\p{N}+-]+$/gu;
const HAS_WORD_CHARACTER = /[\p{L}\p{N}]/u;

/** The folded parts of one raw word, as core's `tokens` cuts words (tested against it). */
export function partsOf(word: string): string[] {
  return fold(word)
    .split(' ')
    .map((part) => part.replace(EDGE_PUNCTUATION, ''))
    .filter((part) => HAS_WORD_CHARACTER.test(part));
}

/** Raw words of a query text: whitespace-separated, at most `MAX_QUERY_WORDS` (the caller checks, see `checkQuery`). */
export const wordsOf = (text: string): string[] => text.split(/\s+/).filter((word) => word !== '');

const leaf = (term: string, options: Omit<QueryCombination, 'queries'>): QueryCombination => ({ ...options, combineWith: 'OR', queries: [term] });

const namesLeaf = (term: string): QueryCombination => leaf(term, { fields: ['name', 'alias'], prefix: true, fuzzy: fuzzyDistance });
const exactLeaf = (term: string): QueryCombination => leaf(term, { fields: ['formula'], prefix: false, fuzzy: false });
const bodyLeaf = (term: string): QueryCombination => leaf(term, { fields: ['tags', 'text'], prefix: false, fuzzy: fuzzyDistance });
const structureLeaf = (word: string): QueryCombination =>
  leaf(word, { fields: ['structure'], prefix: false, fuzzy: false, tokenize: (term) => [term], processTerm: identity });

/** The joined form of several words ("wolffkishner"): a name or alias term, prefix for type-ahead, never fuzzy (a fuzzy join would match "reaction" for "reaction41"). */
const joinedLeaf = (term: string): QueryCombination => leaf(term, { fields: ['name', 'alias'], prefix: true, fuzzy: false });

const group = (term: string): QueryCombination => ({ combineWith: 'OR', queries: [namesLeaf(term), exactLeaf(term), bodyLeaf(term)] });

function wordNode(word: string, parts: readonly string[]): Query {
  const alternatives: Query[] = [structureLeaf(word)];
  if (parts.length === 1) alternatives.unshift(group(parts[0] as string));
  else alternatives.unshift(joinedLeaf(parts.join('')), { combineWith: 'AND', queries: parts.map(group) });
  return { combineWith: 'OR', queries: alternatives };
}

/** The tree for a text, or `undefined` when it has no word with a letter or digit (nothing to look for). */
export function buildQuery(text: string): Query | undefined {
  const items = wordsOf(text)
    .slice(0, MAX_QUERY_WORDS)
    .map((word) => ({ word, parts: partsOf(word) }))
    .filter((item) => item.parts.length > 0);
  if (items.length === 0) return undefined;
  const every: Query = { combineWith: 'AND', queries: items.map((item) => wordNode(item.word, item.parts)) };
  const all = items.flatMap((item) => item.parts);
  return items.length > 1 ? { combineWith: 'OR', queries: [every, joinedLeaf(all.join(''))] } : every;
}
