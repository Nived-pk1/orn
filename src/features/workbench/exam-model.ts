/**
 * The recipes and words of the exam and exam version editors (exams step part 2): plain text kept as typed (a required text stays even when
 * empty so the schema finding says so; an optional one is removed), the status and coverage words, the syllabus units and their topic
 * coverage rows, and the copy of another version's units (NEW unit IDs). Text is stored exactly as given (INV-24). No chemistry.
 */
import type { DraftRecipe } from '@/core/editing';
import type { COVERAGE_LEVELS, EXAM_VERSION_STATUS } from '@/core/schema';
import type { VersionUnit } from './record-picker-contracts';

type Bag = Record<string, unknown>;
const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value);

export const STATUS_WORDS: Readonly<Record<(typeof EXAM_VERSION_STATUS)[number], string>> = {
  official: 'Official (checked against the published syllabus)',
  provisional: 'Provisional (not verified)',
  draft: 'Draft (not verified)',
};
/** The status in one lower-case word, for a summary line ("<label> · provisional · 11 units"). */
export const statusWord = (status: string): string => (status === 'official' || status === 'provisional' || status === 'draft' ? status : 'status not chosen');
export const COVERAGE_WORDS: Readonly<Record<(typeof COVERAGE_LEVELS)[number], string>> = { included: 'Included', partial: 'Partly included', excluded: 'Excluded' };

export const EXAM_FIELD_LABELS: Readonly<Record<string, string>> = { tags: 'Tags', citations: 'Citations', 'review.lifecycle': 'Lifecycle', 'review.status': 'Review status', 'review.reasons': 'Review reasons', 'review.confidence': 'Review confidence', name: 'Name', shortName: 'Short name', authority: 'Authority', notes: 'Notes' };
export const VERSION_FIELD_LABELS: Readonly<Record<string, string>> = { ...EXAM_FIELD_LABELS, examId: 'Exam', label: 'Label', year: 'Year', status: 'Status', effectiveFrom: 'Effective from', effectiveTo: 'Effective to', units: 'Syllabus units' };

/** A text field: a required one is kept even when empty (the schema finding says so), an optional one is removed when empty. */
export const setText = (field: string, value: string, required: boolean): DraftRecipe => (draft) => {
  if (value === '' && !required) Reflect.deleteProperty(draft, field);
  else draft[field] = value;
};
/** A whole-number year is stored; empty removes it; anything else changes nothing (the field shows what was typed). */
export const setYearText = (value: string): DraftRecipe => (draft) => {
  if (value === '') Reflect.deleteProperty(draft, 'year');
  else if (/^\d+$/.test(value)) draft.year = Number(value);
};

export interface CoverageRow {
  readonly topicId: string;
  readonly coverage: string;
}
export interface UnitView {
  readonly id: string;
  readonly title: string;
  readonly code: string;
  readonly officialText: string;
  readonly rows: readonly CoverageRow[];
}
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export function unitsOf(draft: unknown): readonly UnitView[] {
  const units = isBag(draft) && Array.isArray(draft.units) ? draft.units : [];
  return units.filter(isBag).map((unit) => ({
    id: text(unit.id),
    title: text(unit.title),
    code: text(unit.code),
    officialText: text(unit.officialText),
    rows: (Array.isArray(unit.topicCoverage) ? unit.topicCoverage : []).filter(isBag).map((row) => ({ topicId: text(row.topicId), coverage: text(row.coverage) })),
  }));
}

const unitList = (draft: Bag): Bag[] => {
  if (!Array.isArray(draft.units)) draft.units = [];
  return draft.units as Bag[];
};
const rowList = (draft: Bag, unit: number): Bag[] | undefined => {
  const target = unitList(draft)[unit];
  if (target === undefined) return undefined;
  if (!Array.isArray(target.topicCoverage)) target.topicCoverage = [];
  return target.topicCoverage as Bag[];
};

export const addUnit = (id: string): DraftRecipe => (draft) => void unitList(draft).push({ id, title: '', topicCoverage: [] });
export const removeUnit = (index: number): DraftRecipe => (draft) => void unitList(draft).splice(index, 1);
export const setUnitText = (index: number, field: 'title' | 'code' | 'officialText', value: string): DraftRecipe => (draft) => {
  const unit = unitList(draft)[index];
  if (unit === undefined) return;
  if (value === '' && field !== 'title') Reflect.deleteProperty(unit, field);
  else unit[field] = value;
};
/** A new row has neither a topic nor a coverage: both are chosen (no default). */
export const addRow = (unit: number): DraftRecipe => (draft) => void rowList(draft, unit)?.push({});
export const removeRow = (unit: number, row: number): DraftRecipe => (draft) => void rowList(draft, unit)?.splice(row, 1);
export const setRowChoice = (unit: number, row: number, field: 'topicId' | 'coverage', value: string): DraftRecipe => (draft) => {
  const target = rowList(draft, unit)?.[row];
  if (target === undefined) return;
  if (value === '') Reflect.deleteProperty(target, field);
  else target[field] = value;
};

/** The units of another version laid into this draft with NEW unit IDs (the topics, coverage, codes and wording are copied as they are). */
export const copyUnits = (units: readonly VersionUnit[], newId: (prefix: string) => string): DraftRecipe => (draft) => {
  draft.units = units.map((unit) => ({
    id: newId('unt'),
    ...(unit.code === undefined ? {} : { code: unit.code }),
    title: unit.title,
    ...(unit.officialText === undefined ? {} : { officialText: unit.officialText }),
    topicCoverage: unit.topicCoverage.map((row) => ({ topicId: row.topicId, coverage: row.coverage, ...(row.note === undefined ? {} : { note: row.note }) })),
  }));
};

export const rowsWord = (n: number): string => `${n} ${n === 1 ? 'topic' : 'topics'}`;
export const unitsWord = (n: number): string => `${n} ${n === 1 ? 'unit' : 'units'}`;
