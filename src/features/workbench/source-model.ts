/**
 * The source editor's edits as recipes over the draft, and its words (step 6.6a, decision C2). A source is a record of kind `reference`:
 * the kind of source (no default: absent until chosen), title, authors, year, edition, publisher, web address (the safe-URL type is the
 * schema's: a bad address is a finding), identifier, notes. Same rules as the other models: text is stored exactly as typed (INV-24); an
 * EMPTY optional text means the field is ABSENT. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { REFERENCE_KINDS } from '@/core/schema';

export const REF_KIND_WORDS: Readonly<Record<(typeof REFERENCE_KINDS)[number], string>> = {
  textbook: 'Textbook',
  ncert: 'NCERT',
  article: 'Article',
  website: 'Website',
  exam_paper: 'Exam paper',
  syllabus_document: 'Syllabus document',
  notes: 'Notes',
  other: 'Other',
};

export const SOURCE_FIELD_LABELS: Readonly<Record<string, string>> = {
  refKind: 'Kind of source',
  title: 'Title',
  authors: 'Authors',
  year: 'Year',
  edition: 'Edition',
  publisher: 'Publisher',
  url: 'Web address',
  identifier: 'Identifier',
  notes: 'Notes',
  tags: 'Tags',
  citations: 'Citations',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
};

type Fields = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const listOf = (draft: Fields, field: string): unknown[] => {
  if (!Array.isArray(draft[field])) draft[field] = [];
  return draft[field] as unknown[];
};

export interface SourceView {
  readonly refKind: string;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year: string;
  readonly edition: string;
  readonly publisher: string;
  readonly url: string;
  readonly identifier: string;
}

export function sourceViewOf(draft: unknown): SourceView {
  const d = (typeof draft === 'object' && draft !== null ? draft : {}) as Fields;
  return {
    refKind: text(d.refKind),
    title: text(d.title),
    authors: Array.isArray(d.authors) ? d.authors.map(text) : [],
    year: typeof d.year === 'number' ? String(d.year) : '',
    edition: text(d.edition),
    publisher: text(d.publisher),
    url: text(d.url),
    identifier: text(d.identifier),
  };
}

export const setRefKind = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'refKind');
  else draft.refKind = value;
};
/** Title is required (kept even when empty so the schema finding says so); the others are absent when empty. */
export const setSourceText = (field: 'title' | 'edition' | 'publisher' | 'url' | 'identifier', value: string): DraftRecipe => (draft) => {
  if (value === '' && field !== 'title') Reflect.deleteProperty(draft, field);
  else draft[field] = value;
};
/** A whole number is stored; empty removes the year; anything else changes nothing (the field shows what was typed). */
export const setYear = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'year');
  else if (/^\d+$/.test(value)) draft.year = Number(value);
};

export const addAuthor = (): DraftRecipe => (draft) => {
  listOf(draft, 'authors').push('');
};
export const setAuthor = (index: number, value: string): DraftRecipe => (draft) => {
  const list = listOf(draft, 'authors');
  if (index >= 0 && index < list.length) list[index] = value;
};
export const removeAuthor = (index: number): DraftRecipe => (draft) => {
  listOf(draft, 'authors').splice(index, 1);
};
export const moveAuthor = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const list = listOf(draft, 'authors');
  const to = index + by;
  const item = list[index];
  if (item === undefined || to < 0 || to >= list.length) return;
  list.splice(index, 1);
  list.splice(to, 0, item);
};
