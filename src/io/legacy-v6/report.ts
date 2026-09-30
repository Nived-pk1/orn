/**
 * The `LegacyImportReport` under construction (docs/MIGRATION.md §4.7-§4.8). Step 3.10 fills it for compounds; step 3.11 adds the
 * reaction side to the same builder. Review items are the only place a person is asked to decide something: informational
 * notes (`FLAG_SUBSUMED`) are counted apart and never enter the review queue. Output key order is sorted, so the report is
 * byte-identical for the same input.
 */
import type { JsonValue, RecordKind, RecordRef } from '@/core/schema';
import type { LegacyImportReport } from '../contracts';

export const LEGACY_SYSTEM = 'organic-reaction-navigator-v6';

export interface ReportBuilder {
  created(kind: RecordKind): void;
  review(subject: RecordRef, reason: string): void;
  /** A legacy field kept in `provenance.legacy.unmapped`: `field` is the legacy key (`smiles`, `jee.level`, `dropped.tags[*]`). */
  preserved(field: string): void;
  consumedByDefault(path: string): void;
  note(code: string): void;
  notImported(legacyId: string, reason: string): void;
  /** A value that belongs to the document, not to a record (step 3.11b): a top-level field, or `dropped.<path>`. The first value for a key stays; a repeat is a programmer error the caller avoids. */
  documentValue(key: string, value: JsonValue): void;
  /** Adds everything another (partial) report holds: a step that can still be refused builds its own report and absorbs it only when it succeeded. */
  absorb(part: LegacyImportReport): void;
  build(): LegacyImportReport;
}

const sortedCounts = (counts: ReadonlyMap<string, number>): Record<string, number> =>
  Object.fromEntries([...counts].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export function createReportBuilder(sourceSchemaVersion: number): ReportBuilder {
  const createdCounts = new Map<RecordKind, number>();
  const reviewItems: { subject: RecordRef; reason: string }[] = [];
  const preserved = new Map<string, number>();
  const byDefault = new Map<string, number>();
  const notes = new Map<string, number>();
  const notImported: { legacyId: string; reason: string }[] = [];
  const documentValues = new Map<string, JsonValue>();
  const bump = <K>(map: Map<K, number>, key: K): void => void map.set(key, (map.get(key) ?? 0) + 1);
  return {
    created: (kind) => bump(createdCounts, kind),
    review: (subject, reason) => void reviewItems.push({ subject, reason }),
    preserved: (field) => bump(preserved, field),
    consumedByDefault: (path) => bump(byDefault, path),
    note: (code) => bump(notes, code),
    notImported: (legacyId, reason) => void notImported.push({ legacyId, reason }),
    documentValue: (key, value) => void documentValues.set(key, value),
    absorb(part) {
      for (const [kind, count] of Object.entries(part.createdCounts)) createdCounts.set(kind as RecordKind, (createdCounts.get(kind as RecordKind) ?? 0) + (count ?? 0));
      reviewItems.push(...part.reviewItems);
      for (const [field, count] of Object.entries(part.preservedUnmappedFields)) preserved.set(field, (preserved.get(field) ?? 0) + count);
      for (const [path, count] of Object.entries(part.consumedByDefault)) byDefault.set(path, (byDefault.get(path) ?? 0) + count);
      for (const [code, count] of Object.entries(part.notes)) notes.set(code, (notes.get(code) ?? 0) + count);
      notImported.push(...part.notImported);
      for (const [key, value] of Object.entries(part.documentUnmapped)) documentValues.set(key, value);
    },
    build: () => ({
      sourceSystem: LEGACY_SYSTEM,
      sourceSchemaVersion,
      createdCounts: Object.fromEntries([...createdCounts].sort(([a], [b]) => (a < b ? -1 : 1))),
      reviewItems: [...reviewItems],
      preservedUnmappedFields: sortedCounts(preserved),
      notImported: [...notImported],
      consumedByDefault: sortedCounts(byDefault),
      notes: sortedCounts(notes),
      documentUnmapped: Object.fromEntries([...documentValues].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    }),
  };
}
