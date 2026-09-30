/**
 * Snapshot bytes built inside the compute worker (step 4.2c, PERSISTENCE.md §9): the same document, the same deterministic
 * JSON, the same zlib stream as `buildSnapshot` in `src/persistence/snapshot-codec.ts`, so the persistence adapter reads
 * them back with its own decoder. A worker never imports persistence (ADR-034 D1), hence the few lines here instead of an
 * import; tests/integration/snapshot-builder-equality.test.ts proves the bytes equal the codec's byte for byte (fixtures, demo,
 * every generator shape, the same generator given to both sides) and that the compression level is the codec's. The generator
 * is main's: it arrives with each call and the worker keeps no constant of its own (step 4.2e review, follow-up b).
 */
import { strToU8, zlibSync } from 'fflate';
import { serializeDocument, stateToDocument } from '@/core/dataset';
import { CURRENT_SCHEMA_VERSION, type CanonicalState } from '@/core/schema';
import type { DocumentGenerator } from '@/workers/rpc/contracts';

/** The codec's compression level (`COMPRESSION_LEVEL` in snapshot-codec.ts): the same level makes the same bytes. */
export const SNAPSHOT_COMPRESSION_LEVEL = 6;

export type SnapshotBytesOutcome =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly schemaVersion: number }
  | { readonly ok: false; readonly message: string };

export function buildSnapshotBytes(state: CanonicalState, exportedAt: string, generator: DocumentGenerator): SnapshotBytesOutcome {
  const doc = stateToDocument(state, { exportedAt, exportScope: 'full', generator });
  const serialized = serializeDocument(doc);
  if (!serialized.ok) {
    const first = serialized.issues[0];
    return { ok: false, message: `the state does not serialise (${first?.path ?? ''} ${first?.message ?? ''})` };
  }
  return { ok: true, bytes: zlibSync(strToU8(serialized.text), { level: SNAPSHOT_COMPRESSION_LEVEL }), schemaVersion: CURRENT_SCHEMA_VERSION };
}
