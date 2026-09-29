/**
 * DB version 1 → 2 (docs/PERSISTENCE.md §5): `assetBlobs` was keyed by asset ID, so writing new bytes under an
 * ID destroyed the old ones ("Undo import" and snapshot restore could not bring them back). Version 2 keys it by
 * SHA-256 and never overwrites or deletes a row.
 *
 * Re-keying needs every old row's bytes hashed, and hashing is async, which an IndexedDB (versionchange)
 * transaction cannot wait for. So it is two parts: `verifyStoredAssetBlobs` hashes the old rows BEFORE the
 * upgrade (nothing is written), and `rekeyStep` (inside the upgrade transaction, IndexedDB calls only) files each
 * row by that verdict:
 *   - bytes match the recorded hash → `assetBlobs`, keyed by the hash (rows with the same hash are stored once);
 *   - anything else (mismatch, malformed hash, no verdict because the database was opened without the check) →
 *     `assetBlobsUnverified`, whole, keyed by asset ID, and reported by boot. Never dropped, never guessed.
 * The whole upgrade is one versionchange transaction: it commits entirely or not at all.
 */
import Dexie, { type DexieOptions, type Transaction } from 'dexie';
import { sha256OfBlob } from './blob-hash';
import type { AssetBlobRow, AssetVerdict, UnverifiedAssetBlobRow } from './asset-rows';

/** The part of `OrnDb` the upgrade steps use (`tx.db` is the database being upgraded). */
interface VerdictHolder {
  assetVerdicts: ReadonlyMap<string, AssetVerdict> | undefined;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * Hashes every row of an unupgraded (version-1 layout) `assetBlobs`, one at a time. Returns undefined when there
 * is nothing to verify: no such database, or it is already content-addressed. Any failure to read means "no
 * verdicts" (the upgrade then parks every row rather than trust it), and the real open reports its own errors.
 */
export async function verifyStoredAssetBlobs(options: { readonly name: string; readonly indexedDB: NonNullable<DexieOptions['indexedDB']>; readonly IDBKeyRange: NonNullable<DexieOptions['IDBKeyRange']> }): Promise<ReadonlyMap<string, AssetVerdict> | undefined> {
  const probe = new Dexie(options.name, { indexedDB: options.indexedDB, IDBKeyRange: options.IDBKeyRange });
  try {
    await probe.open();
    const table = probe.tables.find((t) => t.name === 'assetBlobs');
    if (table === undefined || table.schema.primKey.name !== 'assetId') return undefined;
    const verdicts = new Map<string, AssetVerdict>();
    for (const key of (await table.toCollection().primaryKeys()) as string[]) {
      const row = (await table.get(key)) as { blob?: unknown } | undefined;
      if (row?.blob instanceof Blob) verdicts.set(key, { sha256: await sha256OfBlob(row.blob), size: row.blob.size });
    }
    return verdicts;
  } catch {
    return undefined;
  } finally {
    probe.close();
  }
}

interface V1Row {
  readonly assetId: string;
  readonly sha256: unknown;
  readonly blob: Blob;
}

/** Upgrade to 1.5: file every version-1 row into the content-addressed holding store or the unverified store. */
export async function rekeyStep(tx: Transaction): Promise<void> {
  const verdicts = (tx.db as unknown as VerdictHolder).assetVerdicts;
  const held = tx.table<AssetBlobRow, string>('assetBlobsRekey');
  const unverified = tx.table<UnverifiedAssetBlobRow, string>('assetBlobsUnverified');
  for (const row of (await tx.table<V1Row, string>('assetBlobs').toArray())) {
    const verdict = verdicts?.get(row.assetId);
    const recorded = typeof row.sha256 === 'string' ? row.sha256 : undefined;
    if (verdict !== undefined && recorded !== undefined && SHA256_HEX.test(recorded) && verdict.sha256 === recorded && verdict.size === row.blob.size) {
      if ((await held.get(recorded)) === undefined) await held.put({ sha256: recorded, blob: row.blob });
    } else {
      await unverified.put({ assetId: row.assetId, recordedSha256: recorded ?? null, actualSha256: verdict?.sha256 ?? null, blob: row.blob });
    }
  }
}

/** Upgrade to 2: move the held rows into the new `assetBlobs` (the holding store is deleted with this version). */
export async function finishRekeyStep(tx: Transaction): Promise<void> {
  const target = tx.table<AssetBlobRow, string>('assetBlobs');
  for (const row of await tx.table<AssetBlobRow, string>('assetBlobsRekey').toArray()) await target.put(row);
  (tx.db as unknown as VerdictHolder).assetVerdicts = undefined;
}
