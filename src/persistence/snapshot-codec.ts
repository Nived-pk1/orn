/**
 * Snapshot build and decode (docs/PERSISTENCE.md §9): a `full` DatasetDocument as deterministic JSON text
 * (INV-19), compressed with fflate. Both directions are pure functions of their input, structured-clone-safe, and
 * plain enough to be hosted by the compute worker in Phase 4.
 *
 * zlib, not gzip: fflate's gzip header carries the current time, which would make identical states differ.
 * Decoding is bounded: the inflated size is capped (a corrupt or hostile stream cannot exhaust memory) and every
 * damage (bad stream, bad JSON, not an ORN dataset) is a value, never an exception.
 */
import { strFromU8, strToU8, Unzlib, zlibSync } from 'fflate';
import { serializeDocument, stateToDocument } from '@/core/dataset';
import type { SerializeIssue } from '@/core/dataset';
import type { MigratableDocument } from '@/core/migrations/contracts';
import { CURRENT_SCHEMA_VERSION, DatasetEnvelopeSchema, type CanonicalState, type DatasetDocument } from '@/core/schema';
import type { SnapshotReason, SnapshotSummary } from './contracts';

/** Same as the package-import cap (docs/SECURITY.md §3): the largest JSON text a snapshot may inflate to. */
export const SNAPSHOT_MAX_JSON_BYTES = 200 * 1024 * 1024;
const COMPRESSION_LEVEL = 6;

export interface SnapshotBuildInput {
  readonly id: string;
  readonly createdAt: string;
  readonly reason: SnapshotReason;
  readonly state: CanonicalState;
  readonly revision: number;
  readonly note?: string;
  readonly generator: DatasetDocument['generator'];
}

export interface BuiltSnapshot {
  readonly summary: SnapshotSummary;
  /** Compressed document; `summary.byteSize` is its length. */
  readonly bytes: Uint8Array;
}

export type SnapshotBuildResult =
  | { readonly ok: true; readonly built: BuiltSnapshot }
  | { readonly ok: false; readonly issues: readonly SerializeIssue[] };

export function buildSnapshot(input: SnapshotBuildInput): SnapshotBuildResult {
  const doc = stateToDocument(input.state, { exportedAt: input.createdAt, exportScope: 'full', generator: input.generator });
  const serialized = serializeDocument(doc);
  if (!serialized.ok) return { ok: false, issues: serialized.issues };
  const bytes = zlibSync(strToU8(serialized.text), { level: COMPRESSION_LEVEL });
  const summary: SnapshotSummary = {
    id: input.id,
    createdAt: input.createdAt,
    reason: input.reason,
    revision: input.revision,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    byteSize: bytes.length,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
  return { ok: true, built: { summary, bytes } };
}

export type SnapshotDecodeResult =
  | { readonly ok: true; readonly doc: MigratableDocument }
  | { readonly ok: false; readonly message: string };

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

/** Compressed bytes → the tolerant document (never strict: an older snapshot has to be migrated first). */
export function decodeSnapshot(bytes: Uint8Array, maxJsonBytes = SNAPSHOT_MAX_JSON_BYTES): SnapshotDecodeResult {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(inflateBounded(bytes, maxJsonBytes)));
  } catch (error) {
    return { ok: false, message: `the stored bytes are not a readable snapshot (${error instanceof Error ? error.message : String(error)})` };
  }
  const envelope = DatasetEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, message: 'the stored document is not an ORN dataset (format, schemaVersion or records missing or malformed)' };
  // The envelope only checks the parts every migration needs; the document itself goes on untouched.
  return { ok: true, doc: raw as MigratableDocument };
}
