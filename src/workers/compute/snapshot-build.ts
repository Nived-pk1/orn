/**
 * Snapshot bytes built inside the compute worker (step 4.2c, PERSISTENCE.md §9): the same document, the same deterministic
 * JSON, the same zlib stream as `buildSnapshot` in `src/persistence/snapshot-codec.ts`, so the persistence adapter reads
 * them back with its own decoder. A worker never imports persistence (ADR-034 D1), hence the few lines here instead of an
 * import; `snapshot-build.test.ts` proves the bytes equal the codec's byte for byte, and that `decodeSnapshot` and
 * `readSnapshot` read them back.
 */
import { strToU8, zlibSync } from 'fflate';
import { serializeDocument, stateToDocument } from '@/core/dataset';
import { CURRENT_SCHEMA_VERSION, type CanonicalState } from '@/core/schema';

/** The codec's compression level (`COMPRESSION_LEVEL` in snapshot-codec.ts): the same level makes the same bytes. */
const COMPRESSION_LEVEL = 6;

/** The adapter's default generator (`DEFAULT_GENERATOR` in adapter.ts); a document field, not behaviour. */
export const SNAPSHOT_GENERATOR = { app: 'organic-reaction-navigator', version: '0.1.0' } as const;

export type SnapshotBytesOutcome =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly schemaVersion: number }
  | { readonly ok: false; readonly message: string };

export function buildSnapshotBytes(state: CanonicalState, exportedAt: string, generator: { readonly app: string; readonly version: string } = SNAPSHOT_GENERATOR): SnapshotBytesOutcome {
  const doc = stateToDocument(state, { exportedAt, exportScope: 'full', generator });
  const serialized = serializeDocument(doc);
  if (!serialized.ok) {
    const first = serialized.issues[0];
    return { ok: false, message: `the state does not serialise (${first?.path ?? ''} ${first?.message ?? ''})` };
  }
  return { ok: true, bytes: zlibSync(strToU8(serialized.text), { level: COMPRESSION_LEVEL }), schemaVersion: CURRENT_SCHEMA_VERSION };
}
