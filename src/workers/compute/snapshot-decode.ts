/**
 * Snapshot bytes decoded inside the compute worker (step 4.2d, PERSISTENCE.md §9): the same bounded inflate, the same envelope
 * check, then the steps of `readSnapshot` + `restoreSnapshot` that need no store: the summary's schema version against the
 * document's, migration (an injected runner), the strict L1 parse and the duplicate-ID check. A worker never imports
 * persistence (ADR-034 D1), so this repeats `decodeSnapshot` (`src/persistence/snapshot-codec.ts`) and the restore steps;
 * tests/integration/snapshot-decode-equality.test.ts proves the results equal the in-process ones (values and messages) for
 * damaged, oversized, older, invalid and valid input, and that the size cap is the codec's. Every damage is a value.
 */
import { strFromU8, Unzlib } from 'fflate';
import { z } from 'zod';
import { documentToState } from '@/core/dataset';
import type { MigratableDocument, MigrationRunner, MigrationStepReport } from '@/core/migrations/contracts';
import { DATASET_FORMAT, DatasetDocumentSchema, type CanonicalState } from '@/core/schema';
import type { SnapshotDecodeRefused } from '@/workers/rpc/contracts';

/** The codec's cap (`SNAPSHOT_MAX_JSON_BYTES`): the largest JSON text a snapshot may inflate to (docs/SECURITY.md §3). */
export const WORKER_SNAPSHOT_MAX_JSON_BYTES = 200 * 1024 * 1024;
/** The restore's cap on reported issues (`MAX_REPORTED_ISSUES` in restore.ts). */
const MAX_REPORTED_ISSUES = 20;

const StoredEnvelopeSchema = z.object({
  format: z.literal(DATASET_FORMAT),
  schemaVersion: z.number(),
  records: z.record(z.string(), z.array(z.unknown())),
});

export type BytesDecodeResult = { readonly ok: true; readonly doc: MigratableDocument } | { readonly ok: false; readonly message: string };

function inflateBounded(bytes: Uint8Array, maxBytes: number): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const stream = new Unzlib((chunk) => {
    total += chunk.length;
    if (total > maxBytes) throw new RangeError(`inflates to more than ${maxBytes} bytes`);
    chunks.push(chunk);
  });
  stream.push(bytes, true);
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** The same as `decodeSnapshot` of the persistence codec. */
export function decodeSnapshotBytes(bytes: Uint8Array, maxJsonBytes = WORKER_SNAPSHOT_MAX_JSON_BYTES): BytesDecodeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(inflateBounded(bytes, maxJsonBytes)));
  } catch (error) {
    return { ok: false, message: `the stored bytes are not a readable snapshot (${error instanceof Error ? error.message : String(error)})` };
  }
  const envelope = StoredEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, message: 'the stored document is not an ORN dataset (format, schemaVersion or records missing or malformed)' };
  return { ok: true, doc: raw as MigratableDocument };
}

export type RestoredDocument =
  | { readonly ok: true; readonly state: CanonicalState; readonly steps: readonly MigrationStepReport[] }
  | { readonly ok: false; readonly answer: SnapshotDecodeRefused };

/** `readSnapshot`'s decode and the store-free half of `restoreSnapshot`, with the same codes and messages. */
export function restoreDocument(input: { readonly bytes: Uint8Array; readonly id: string; readonly schemaVersion: number }, runner: MigrationRunner, maxJsonBytes = WORKER_SNAPSHOT_MAX_JSON_BYTES): RestoredDocument {
  const { id } = input;
  const decoded = decodeSnapshotBytes(input.bytes, maxJsonBytes);
  if (!decoded.ok) return { ok: false, answer: { ok: false, code: 'CORRUPT', message: `snapshot ${id}: ${decoded.message}` } };
  if (decoded.doc.schemaVersion !== input.schemaVersion) {
    return {
      ok: false,
      answer: { ok: false, code: 'CORRUPT', message: `snapshot ${id} says schema version ${input.schemaVersion} but its document says ${String(decoded.doc.schemaVersion)}` },
    };
  }
  const migrated = runner.run(decoded.doc);
  if (!migrated.ok) return { ok: false, answer: { ok: false, code: 'MIGRATION_FAILED', message: migrated.message, migration: migrated } };
  const parsed = DatasetDocumentSchema.safeParse(migrated.doc);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
    return { ok: false, answer: { ok: false, code: 'INVALID', message: `snapshot ${id} does not pass validation (${parsed.error.issues.length} issue(s))`, issues } };
  }
  const restored = documentToState(parsed.data);
  if (!restored.ok) {
    const issues = restored.duplicates.slice(0, MAX_REPORTED_ISSUES).map((d) => ({ path: `records.${d.kind}`, message: `duplicate ID ${d.id}` }));
    return { ok: false, answer: { ok: false, code: 'INVALID', message: `snapshot ${id} repeats record IDs`, issues } };
  }
  return { ok: true, state: restored.state, steps: migrated.steps };
}
