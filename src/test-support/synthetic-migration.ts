/**
 * Synthetic migration steps and helpers for the migrations-framework tests (Phase 3 note 1, P-03 framework form):
 * no schema bump exists yet, so a made-up "version 0" shape is migrated to the real current one. Test-only.
 *
 * The made-up v0 shape: `meta.name` instead of `meta.title`, and species records may carry a field the schema never
 * had (`legacyColor`). The step renames the first and moves the second into `provenance.legacy.unmapped` (INV-23:
 * nothing is dropped), reporting both.
 */
import type { MigratableDocument, SchemaMigration } from '@/core/migrations/contracts';

type Row = Record<string, unknown>;
export const SYNTHETIC_SYSTEM = 'synthetic-v0';

export const SYNTHETIC_STEPS: readonly SchemaMigration[] = [
  {
    from: 0,
    to: 1,
    description: 'synthetic: meta.name → meta.title; species legacyColor → provenance.legacy.unmapped',
    migrate(doc) {
      const notes: string[] = [];
      const changedRecordIds: string[] = [];
      const { name, ...restOfMeta } = doc['meta'] as Row;
      const meta = name === undefined ? restOfMeta : { ...restOfMeta, title: name };
      if (name !== undefined) notes.push('meta.name renamed to meta.title');

      const species = ((doc.records['species'] ?? []) as Row[]).map((row) => {
        const { legacyColor, ...rest } = row;
        if (legacyColor === undefined) return row;
        const provenance = rest['provenance'] as Row;
        const legacy = (provenance['legacy'] ?? { system: SYNTHETIC_SYSTEM }) as Row;
        const unmapped = { ...((legacy['unmapped'] as Row | undefined) ?? {}), legacyColor };
        changedRecordIds.push(String(row['id']));
        notes.push(`${String(row['id'])}: legacyColor kept in provenance.legacy.unmapped`);
        return { ...rest, provenance: { ...provenance, legacy: { ...legacy, unmapped } } };
      });
      const out: MigratableDocument = { ...doc, schemaVersion: 1, meta, records: { ...doc.records, species } };
      return { doc: out, report: { from: 0, to: 1, description: 'synthetic v0 → v1', changedRecordIds, notes } };
    },
  },
];

/** The same value with every object's keys in reverse order: a different input key order, the same data. */
export function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverseKeys(v)]));
  }
  return value;
}

/** JSON with keys sorted at every level, 2-space indent, LF, trailing newline: byte-comparable across key orders. */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sort(x)]));
    return v;
  };
  return `${JSON.stringify(sort(value), null, 2)}\n`;
}
