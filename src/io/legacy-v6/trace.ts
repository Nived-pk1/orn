/**
 * The consumed-path trace (docs/MIGRATION.md §4.8): the mapper records, for every legacy leaf it turned into a schema field, the
 * path of that leaf (`compounds[3].smiles`, `formatPath` spelling). A leaf that goes to `provenance.legacy.unmapped` instead is NOT
 * traced: it is found in the record. The completeness tests enumerate the legacy leaves themselves and never rely on this set to
 * say what exists.
 */
import { formatPath, leavesOf, type Segment } from './dropped';

export interface ConsumedTrace {
  /** Marks every scalar leaf under `value` (found at `base`) as consumed. Empty arrays and objects hold no leaf. */
  consume(base: readonly Segment[], value: unknown): void;
  readonly paths: ReadonlySet<string>;
}

export function createTrace(): ConsumedTrace {
  const paths = new Set<string>();
  return {
    paths,
    consume(base, value) {
      for (const leaf of leavesOf(value, base)) paths.add(formatPath(leaf.path));
    },
  };
}

/** `compounds[12].tags[0]` → `compounds[*].tags[*]`: the key the report counts occurrences under. */
export const generalizePath = (path: string): string => path.replace(/\[\d+\]/g, '[*]');

/** True for the values v6 treats as "nothing here": `""`, `[]`, `{}`, `null` (MIGRATION.md §4.8). */
export function isEmptyLegacyValue(value: unknown): boolean {
  if (value === '' || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && value !== undefined && Object.keys(value as object).length === 0;
}
