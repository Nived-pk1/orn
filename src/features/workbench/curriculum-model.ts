/**
 * The recipes and words the curriculum editors share (step 6.6c): a plain choice (a value, or absent when empty), a record reference, the
 * words for a mapping role and an exam scope, and a number kept as typed. Text and numbers are stored exactly as given (INV-24); a schema
 * problem is a finding, not a fix. No chemistry.
 */
import type { DraftRecipe } from '@/core/editing';
import { EXAM_SCOPES, MAPPING_ROLES, TOPIC_KINDS, type ExamScope } from '@/core/schema';
import { shortName } from '@/core/editing';
import type { PickKind, RecordPickerPort } from './record-picker-contracts';

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

export const textField = (draft: unknown, field: string): string => (isBag(draft) && typeof draft[field] === 'string' ? (draft[field] as string) : '');
export const numberField = (draft: unknown, field: string): number | undefined => (isBag(draft) && typeof draft[field] === 'number' ? (draft[field] as number) : undefined);
export const refField = (draft: unknown, field: string): { readonly kind: string; readonly id: string } | undefined => {
  const value = isBag(draft) ? draft[field] : undefined;
  return isBag(value) && typeof value.kind === 'string' && typeof value.id === 'string' ? { kind: value.kind, id: value.id } : undefined;
};

/** A choice from a list: "" removes the field (L1 refuses Save when it is required). */
export const setChoice = (field: string, value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, field);
  else draft[field] = value;
};
export const setNumber = (field: string, value: number | undefined): DraftRecipe => (draft) => {
  if (value === undefined) Reflect.deleteProperty(draft, field);
  else draft[field] = value;
};
export const setRef = (field: string, ref: { readonly kind: string; readonly id: string } | undefined): DraftRecipe => (draft) => {
  if (ref === undefined) Reflect.deleteProperty(draft, field);
  else draft[field] = { kind: ref.kind, id: ref.id };
};

export const capitalWord = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
const capital = capitalWord;

export const TOPIC_KIND_WORDS: Readonly<Record<(typeof TOPIC_KINDS)[number], string>> = Object.fromEntries(TOPIC_KINDS.map((kind) => [kind, capital(kind)])) as Record<(typeof TOPIC_KINDS)[number], string>;
export const ROLE_WORDS: Readonly<Record<(typeof MAPPING_ROLES)[number], string>> = Object.fromEntries(MAPPING_ROLES.map((role) => [role, capital(role)])) as Record<(typeof MAPPING_ROLES)[number], string>;
/** The four exam scopes in plain words (JEE_ONTOLOGY section 4). */
export const SCOPE_WORDS: Readonly<Record<ExamScope, string>> = {
  official: 'Official (in the syllabus)',
  prerequisite: 'Prerequisite (needed to follow the syllabus)',
  enrichment: 'Enrichment (beyond the syllabus, worth knowing)',
  outside: 'Outside the syllabus',
};
export const SCOPES: readonly ExamScope[] = EXAM_SCOPES;

/** The kinds a topic mapping or an exam relevance can target and the pickers can search (routes have no search yet: Phase 7). */
export const TARGET_KINDS: readonly PickKind[] = ['species', 'class', 'reagent', 'reaction', 'mechanism', 'concept', 'reference', 'named_reaction', 'transformation', 'caveat'];
/** Kinds whose editor shows the read-only curriculum lists (every kind that can be a target and has an editor). */
export const CURRICULUM_TARGET_KINDS: readonly string[] = [...TARGET_KINDS, 'relationship'];

/** The words that name a curriculum record in its editor's title ("<record> in <topic>"); undefined until the parts are chosen. */
export function curriculumTitleWords(kind: string, draft: unknown, picker: RecordPickerPort | undefined): string | undefined {
  const target = refField(draft, 'target');
  const nameOfTarget = (): string | undefined => (target === undefined ? undefined : shortName(picker?.describe(target.kind as PickKind, target.id)?.name ?? target.id));
  if (kind === 'topic_mapping') {
    const topicId = textField(draft, 'topicId');
    const name = nameOfTarget();
    if (name === undefined || topicId === '') return undefined;
    return `${name} in ${shortName(picker?.topics?.().find((t) => t.id === topicId)?.name ?? topicId)}`;
  }
  if (kind === 'navigator_anchor') {
    const label = textField(draft, 'label');
    return label !== '' ? shortName(label) : nameOfTarget();
  }
  if (kind === 'exam_relevance') {
    const examId = textField(draft, 'examId');
    const name = nameOfTarget();
    if (name === undefined || examId === '') return undefined;
    return `${name} for ${shortName(picker?.exams?.().find((e) => e.id === examId)?.name ?? examId)}`;
  }
  return undefined;
}

const COMMON: Readonly<Record<string, string>> = {
  tags: 'Tags',
  citations: 'Citations',
  'review.lifecycle': 'Lifecycle',
  'review.status': 'Review status',
  'review.reasons': 'Review reasons',
  'review.confidence': 'Review confidence',
};
export const TOPIC_FIELD_LABELS: Readonly<Record<string, string>> = { ...COMMON, name: 'Name', aliases: 'Aliases', topicKind: 'Kind of topic', parentId: 'Parent topic', order: 'Order', summary: 'Summary', notes: 'Notes' };
export const MAPPING_FIELD_LABELS: Readonly<Record<string, string>> = { ...COMMON, topicId: 'Topic', target: 'Record', role: 'Role', note: 'Note' };
export const RELEVANCE_FIELD_LABELS: Readonly<Record<string, string>> = { ...COMMON, target: 'Record', examId: 'Exam', examVersionIds: 'Versions', scope: 'Scope', importance: 'Importance', note: 'Note' };
export const FAMILY_FIELD_LABELS: Readonly<Record<string, string>> = { target: 'Class', label: 'Label', group: 'Group', tone: 'Tone', order: 'Order', cell: 'Cell' };
