/**
 * The shared record fields as recipes over the draft, and their words (step 6.6a, decisions C1 and C2): notes and study notes, tags,
 * concepts and citations, the same for every editor. Same rules as the other models: text is stored exactly as typed (INV-24); an
 * EMPTY optional text means the field is ABSENT; a schema problem is a finding, not a fix. A tag is normalised only as the schema
 * says (not blank, at most 64 characters): no trimming, no case folding. A citation list is found by its draft path, so a species
 * property's citations use the same recipes as the record's own. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import { LIMITS } from '@/core/schema';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The array at a dotted draft path ("citations", "properties.2.citations"), created empty when the last step is missing. */
function listAt(draft: Fields, path: string): unknown[] {
  const steps = path.split('.');
  let at: unknown = draft;
  for (const step of steps.slice(0, -1)) at = Array.isArray(at) ? at[Number(step)] : isBag(at) ? at[step] : undefined;
  const last = steps[steps.length - 1] ?? '';
  if (!isBag(at)) return [];
  if (!Array.isArray(at[last])) at[last] = [];
  return at[last] as unknown[];
}
const readList = (draft: unknown, path: string): unknown[] => {
  let at: unknown = draft;
  for (const step of path.split('.')) at = Array.isArray(at) ? at[Number(step)] : isBag(at) ? at[step] : undefined;
  return Array.isArray(at) ? at : [];
};

export const setTextField = (field: string, value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, field);
  else draft[field] = value;
};
export const textOf = (draft: unknown, field: string): string => {
  const value = isBag(draft) ? draft[field] : undefined;
  return typeof value === 'string' ? value : '';
};

// ---- tags
export const tagsOf = (draft: unknown): string[] => readList(draft, 'tags').filter((tag): tag is string => typeof tag === 'string');
export const addTag = (text: string): DraftRecipe => (draft) => {
  listAt(draft, 'tags').push(text);
};
export const removeTag = (index: number): DraftRecipe => (draft) => {
  listAt(draft, 'tags').splice(index, 1);
};

/** Why a tag cannot be added (words), or a note about a similar one. A duplicate is the EXACT same string; capitals alone differ = allowed with a note. */
export function tagProblem(tags: readonly string[], text: string): { readonly refusal?: string; readonly note?: string } {
  if (text.trim() === '') return { refusal: 'A tag cannot be empty.' };
  if (text.length > LIMITS.tag) return { refusal: `A tag is at most ${LIMITS.tag} characters.` };
  if (tags.includes(text)) return { refusal: `"${text}" is already a tag here.` };
  if (tags.length >= LIMITS.tags) return { refusal: `At most ${LIMITS.tags} tags can be added.` };
  const similar = tags.find((tag) => tag.toLowerCase() === text.toLowerCase());
  return similar === undefined ? {} : { note: `A similar tag is already here: ${similar}` };
}

// ---- concepts (only where the schema has `conceptIds`)
export const conceptIdsOf = (draft: unknown, field = 'conceptIds'): string[] => readList(draft, field).filter((id): id is string => typeof id === 'string');
export const addConcept = (id: string, field = 'conceptIds'): DraftRecipe => (draft) => {
  const list = listAt(draft, field);
  if (!list.includes(id)) list.push(id);
};
export const removeConcept = (index: number, field = 'conceptIds'): DraftRecipe => (draft) => {
  listAt(draft, field).splice(index, 1);
};

// ---- citations: { referenceId, locator?, note? }
export interface CitationView {
  readonly referenceId: string;
  readonly locator: string;
  readonly note: string;
}
export const citationsOf = (draft: unknown, path = 'citations'): CitationView[] =>
  readList(draft, path).flatMap((item) => (isBag(item) && typeof item.referenceId === 'string' ? [{ referenceId: item.referenceId, locator: typeof item.locator === 'string' ? item.locator : '', note: typeof item.note === 'string' ? item.note : '' }] : []));

export const addCitation = (path: string, referenceId: string): DraftRecipe => (draft) => {
  listAt(draft, path).push({ referenceId });
};
export const setCitationField = (path: string, index: number, field: 'locator' | 'note', value: string): DraftRecipe => (draft) => {
  const item = listAt(draft, path)[index];
  if (!isBag(item)) return;
  if (value === '') Reflect.deleteProperty(item, field);
  else item[field] = value;
};
export const removeCitation = (path: string, index: number): DraftRecipe => (draft) => {
  listAt(draft, path).splice(index, 1);
};
export const moveCitation = (path: string, index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const list = listAt(draft, path);
  const to = index + by;
  const item = list[index];
  if (item === undefined || to < 0 || to >= list.length) return;
  list.splice(index, 1);
  list.splice(to, 0, item);
};

/** "<source title> (<year>) · <locator>", leaving out what is absent; a source that is not in the dataset says so. */
export function citationLine(source: { readonly title: string; readonly year?: number | undefined } | undefined, citation: { readonly referenceId: string; readonly locator?: string | undefined }): string {
  const head = source === undefined ? `${citation.referenceId} (not in this dataset)` : source.year === undefined ? source.title : `${source.title} (${source.year})`;
  return citation.locator === undefined || citation.locator === '' ? head : `${head} · ${citation.locator}`;
}
