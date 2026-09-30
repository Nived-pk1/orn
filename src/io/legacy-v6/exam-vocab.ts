/**
 * The v6 `jee.relevance` values and the exam(s) each stands for (docs/MIGRATION.md §4.5). This table is LEGACY-FORMAT vocabulary,
 * data of the v6 file format like `fg-registry.ts`: nothing branches on a record ID or on a record's own name, and exams are matched
 * in the LIVE dataset by folded name. Exams are never created by the importer.
 */

export interface LegacyExamTarget {
  /** The suffix of the relevance record's ID (`erl_v6-<reaction>-<key>`). */
  readonly key: 'main' | 'advanced';
  /** The exam's name in a dataset, matched by folded name or alias. */
  readonly examName: string;
}

const MAIN: LegacyExamTarget = { key: 'main', examName: 'JEE Main' }; // hardcode-ok: legacy v6 relevance vocabulary (format data); the exam is matched by folded name in the live dataset
const ADVANCED: LegacyExamTarget = { key: 'advanced', examName: 'JEE Advanced' }; // hardcode-ok: legacy v6 relevance vocabulary (format data); the exam is matched by folded name in the live dataset

/** `both`, `main`, `advanced` (exact, case-sensitive, as v6 writes them); every other value is not a relevance flag. */
const TABLE: ReadonlyMap<string, readonly LegacyExamTarget[]> = new Map([
  ['both', [MAIN, ADVANCED]],
  ['main', [MAIN]],
  ['advanced', [ADVANCED]],
]);

export const examTargetsOf = (relevance: string): readonly LegacyExamTarget[] | undefined => TABLE.get(relevance);
