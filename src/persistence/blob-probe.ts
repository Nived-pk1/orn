/**
 * The Blob probe (step 5.10a, docs/PERSISTENCE.md §4 step 1). Some browser windows open IndexedDB fine but refuse to store a Blob
 * (a Safari private window, which is what Playwright's ordinary WebKit context behaves like): the first `pre_import` snapshot would
 * then fail. So right after the database opens, a 1-byte Blob is put into `snapshots` in a read-write transaction that is ABORTED on
 * purpose, whatever the put does: nothing is ever committed. The refusal shows on the put request itself, before any commit (measured
 * in Chromium, Firefox and WebKit, PROGRESS "Step 5.10a, part 1"). No browser is recognised by name.
 */
import { describeError } from './events';
import type { OrnDb, SnapshotRow } from './db';

export type BlobProbeResult = { readonly ok: true } | { readonly ok: false; readonly detail: string };

/** The id of the probe row (never committed); the test kit's mutation spy knows it. */
export const BLOB_PROBE_ID = '__blob_probe__';

export async function probeBlobStorage(db: OrnDb): Promise<BlobProbeResult> {
  if (typeof Blob === 'undefined') return { ok: false, detail: 'this environment has no Blob type' };
  let failure: unknown;
  let sawPut = false;
  const row: SnapshotRow = { id: BLOB_PROBE_ID, createdAt: '', reason: 'manual', revision: 0, schemaVersion: 0, byteSize: 1, blob: new Blob([new Uint8Array([0])]) };
  try {
    await db.transaction('rw', db.snapshots, async (tx) => {
      try {
        await db.snapshots.put(row);
        sawPut = true;
      } catch (error) {
        failure = error;
      }
      tx.abort();
    });
  } catch (error) {
    // Our own abort rejects the transaction with an AbortError; anything else, before the put answered, is a failure too.
    if (!sawPut && failure === undefined) failure = error;
  }
  if (failure === undefined && sawPut) return { ok: true };
  return { ok: false, detail: `the browser refused to store a Blob in the local database (${describeError(failure)}); nothing was written` };
}
