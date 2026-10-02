/**
 * Shape checks for what crosses into the search worker (step 4.5): documents (load, apply, a serialised index) and queries. They
 * return the first problem as text, or `undefined`; the worker answers `BAD_REQUEST` with it. A document that passes can be indexed,
 * filtered and ranked without a further check.
 */
import { MAX_QUERY_CHARS, MAX_QUERY_WORDS, MAX_SEARCH_LIMIT, SCOPE_NAMES, SEARCH_TEXT_CAP, type SearchQuery } from '../contracts';
import { SEARCH_KINDS } from '../document';
import { wordsOf } from './query';

const KINDS: ReadonlySet<string> = new Set(SEARCH_KINDS);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is readonly string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function checkDocument(value: unknown): string | undefined {
  if (!isObject(value)) return 'a document is not an object';
  const id = typeof value.id === 'string' ? value.id : '(no id)';
  const bad = (what: string): string => `document ${id}: ${what}`;
  if (typeof value.id !== 'string' || value.id === '') return bad('id must be a non-empty string');
  if (typeof value.kind !== 'string' || !KINDS.has(value.kind)) return bad(`kind ${String(value.kind)} is not an indexed kind`);
  if (typeof value.title !== 'string') return bad('title must be a string');
  for (const key of ['names', 'aliases', 'tags'] as const) if (!strings(value[key])) return bad(`${key} must be an array of strings`);
  for (const key of ['formula', 'derivedFormula', 'structureText'] as const) if (value[key] !== undefined && typeof value[key] !== 'string') return bad(`${key} must be a string`);
  if (typeof value.text !== 'string' || value.text.length > SEARCH_TEXT_CAP) return bad(`text must be a string of at most ${SEARCH_TEXT_CAP} characters`);
  if (typeof value.textTruncated !== 'boolean') return bad('textTruncated must be a boolean');
  if (value.lifecycle !== 'draft' && value.lifecycle !== 'published') return bad('lifecycle must be draft or published');
  if (!isObject(value.scopeRanks) || !Object.values(value.scopeRanks).every((rank) => rank === 0 || rank === 1 || rank === 2 || rank === 3)) return bad('scopeRanks must map exam version ids to ranks 0 to 3');
  const facets = value.facets;
  if (!isObject(facets) || !strings(facets.reagentFamilies) || !strings(facets.topicIds) || !strings(facets.scopes) || typeof facets.reviewStatus !== 'string') return bad('facets are malformed');
  if (!facets.scopes.every((scope) => (SCOPE_NAMES as readonly string[]).includes(scope))) return bad('facets.scopes holds an unknown scope');
  return undefined;
}

export function checkQuery(query: SearchQuery): string | undefined {
  if (typeof query !== 'object' || query === null || typeof query.text !== 'string') return 'a query needs a text';
  if (query.text.length > MAX_QUERY_CHARS) return `query text is longer than ${MAX_QUERY_CHARS} characters`;
  if (wordsOf(query.text).length > MAX_QUERY_WORDS) return `query has more than ${MAX_QUERY_WORDS} words`;
  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_SEARCH_LIMIT) return `limit must be an integer from 1 to ${MAX_SEARCH_LIMIT}`;
  if (query.kinds !== undefined && !(Array.isArray(query.kinds) && query.kinds.every((kind) => KINDS.has(kind)))) return 'kinds must be indexed kinds';
  if (query.examVersionId !== undefined && typeof query.examVersionId !== 'string') return 'examVersionId must be a string';
  const facets = query.facets;
  if (facets !== undefined) {
    if (!isObject(facets)) return 'facets must be an object';
    for (const key of ['reagentFamilies', 'topicIds', 'scopes'] as const) if (facets[key] !== undefined && !strings(facets[key])) return `facets.${key} must be an array of strings`;
    if (facets.reviewStatus !== undefined && typeof facets.reviewStatus !== 'string') return 'facets.reviewStatus must be a string';
  }
  return undefined;
}
