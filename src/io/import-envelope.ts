/**
 * The tolerant envelope → migration → per-record L1 → quarantine pipeline (docs/PERSISTENCE.md §6–§7,
 * IMPLEMENTATION_PLAN.md §2 step 3.6), shared by `.orn.json` and a `.ornpkg`'s `dataset.json`. One bad
 * record never rejects the whole file (the envelope check first, then per-record L1); a bad or newer
 * schema version on the whole document does (ADV-041 file part).
 *
 * The envelope's `schemaVersion` check accepts ANY number, not `DatasetEnvelopeSchema`'s `min(1)`: the same
 * reading step 3.3's review gave `decodeSnapshot` ("it accepts any numeric schemaVersion — the runner
 * decides usability — so a snapshot of data the runner refuses reports the runner's reason instead of
 * 'corrupt'", docs/PROGRESS.md). A file claiming `schemaVersion: 0` or `-5` should get the migration
 * runner's own clear `INVALID_VERSION` explanation, not a generic "not shaped like an ORN dataset".
 */
import { DATASET_FORMAT, type AnyRecord, type JsonValue, type RecordKind } from '@/core/schema';
import type { MigratableDocument, MigrationRunner } from '@/core/migrations/contracts';
import { validator } from '@/core/validation';
import { z } from 'zod';
import { issueOf } from './l1-issues';
import { IMPORT_LIMITS, type ImportRejectionCode, type KindMismatch, type QuarantinedItem } from './contracts';

const ImportEnvelopeSchema = z.object({
  format: z.literal(DATASET_FORMAT),
  schemaVersion: z.number(),
  records: z.record(z.string(), z.array(z.unknown())),
});

export interface EnvelopeParseDeps {
  readonly runner: MigrationRunner;
}

export interface EnvelopeParseData {
  readonly detectedSchemaVersion: number;
  readonly migrationsApplied: readonly string[];
  readonly meta?: JsonValue;
  readonly records: Readonly<Partial<Record<RecordKind, readonly AnyRecord[]>>>;
  readonly counts: Readonly<Partial<Record<RecordKind, number>>>;
  readonly quarantined: readonly QuarantinedItem[];
  readonly kindMismatches: readonly KindMismatch[];
}

export type EnvelopeParseOutcome = { readonly ok: true; readonly data: EnvelopeParseData } | { readonly ok: false; readonly code: ImportRejectionCode; readonly message: string };

export function quarantineRaw(row: unknown): { readonly raw: JsonValue; readonly rawTruncated?: { readonly originalChars: number } } {
  const text = JSON.stringify(row);
  if (text.length <= IMPORT_LIMITS.maxQuarantineRawBytes) return { raw: row as JsonValue };
  return { raw: text.slice(0, IMPORT_LIMITS.maxQuarantineRawBytes), rawTruncated: { originalChars: text.length } };
}

function totalRecordCount(records: Readonly<Record<string, readonly unknown[]>>): number {
  let total = 0;
  for (const rows of Object.values(records)) total += rows.length;
  return total;
}

export function parseDatasetEnvelope(value: unknown, deps: EnvelopeParseDeps): EnvelopeParseOutcome {
  const envelope = ImportEnvelopeSchema.safeParse(value);
  if (!envelope.success) return { ok: false, code: 'INVALID_ENVELOPE', message: 'not shaped like an ORN dataset (format, schemaVersion or records missing or malformed)' };

  const count = totalRecordCount(envelope.data.records);
  if (count > IMPORT_LIMITS.maxRecords) {
    return { ok: false, code: 'TOO_MANY_RECORDS', message: `${count} records exceeds the cap of ${IMPORT_LIMITS.maxRecords}` };
  }

  // `ImportEnvelopeSchema` (z.object, not .passthrough()) strips unknown keys, including `meta`: a real
  // migration step may need to read/rewrite it, so it rides along explicitly, not lost between the envelope
  // check and the runner.
  const rawMeta = typeof value === 'object' && value !== null ? (value as { meta?: unknown }).meta : undefined;
  const toMigrate: MigratableDocument = { ...envelope.data, ...(rawMeta === undefined ? {} : { meta: rawMeta }) };
  const migrated = deps.runner.run(toMigrate);
  if (!migrated.ok) {
    const code: ImportRejectionCode = migrated.code === 'NEWER_VERSION' ? 'NEWER_SCHEMA' : 'MIGRATION_FAILED';
    return { ok: false, code, message: `${migrated.message} (at schema version ${migrated.atVersion})` };
  }

  const records: Partial<Record<RecordKind, AnyRecord[]>> = {};
  const counts: Partial<Record<RecordKind, number>> = {};
  const quarantined: QuarantinedItem[] = [];
  const kindMismatches: KindMismatch[] = [];
  for (const [kindKey, rows] of Object.entries(migrated.doc.records)) {
    for (const row of rows) {
      const claimedKind = typeof row === 'object' && row !== null ? (row as { kind?: unknown }).kind : kindKey;
      const parsed = validator.parseRecord(claimedKind as RecordKind, row);
      if (!parsed.ok) {
        const claimedId = typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined;
        quarantined.push({
          ...(typeof claimedKind === 'string' ? { claimedKind } : {}),
          ...(typeof claimedId === 'string' ? { claimedId } : {}),
          issues: parsed.findings.map(issueOf),
          ...quarantineRaw(row),
        });
        continue;
      }
      const kind = parsed.record.kind;
      if (kind !== kindKey) kindMismatches.push({ id: parsed.record.id, envelopeKind: kindKey, ownKind: kind });
      (records[kind] ??= []).push(parsed.record);
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
  }
  // A row filed under another envelope key is still parsed above by its OWN `.kind` field (matching boot's
  // convention, src/persistence/boot-load.ts): the envelope's grouping is informational, never authoritative,
  // and the mismatch is reported in `kindMismatches` (step 3.6 review, item e).
  const meta = migrated.doc['meta'];

  return {
    ok: true,
    data: {
      detectedSchemaVersion: envelope.data.schemaVersion,
      migrationsApplied: migrated.steps.map((step) => step.description),
      ...(meta === undefined ? {} : { meta: meta as JsonValue }),
      records,
      counts,
      quarantined,
      kindMismatches,
    },
  };
}
