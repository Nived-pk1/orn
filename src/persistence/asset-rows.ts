/** Row shapes of the two asset-byte stores (docs/PERSISTENCE.md §2, §5). Kept apart from `db.ts` so the upgrade code and the database class do not import each other. */

/** Content-addressed (DB version 2): the key IS the SHA-256 of the bytes, so a row is never overwritten, only added. */
export interface AssetBlobRow {
  readonly sha256: string;
  readonly blob: Blob;
}

/**
 * A version-1 row the upgrade could not verify (bytes do not hash to the recorded SHA-256, or the hash was
 * malformed): kept whole, keyed by asset ID, and reported by boot. Never dropped, never served as the asset's bytes.
 */
export interface UnverifiedAssetBlobRow {
  readonly assetId: string;
  readonly recordedSha256: string | null;
  /** What the bytes really hash to; null when they were never hashed (opened without the pre-upgrade check). */
  readonly actualSha256: string | null;
  readonly blob: Blob;
}

/** What hashing one version-1 row found. `size` guards against a row rewritten between the check and the upgrade. */
export interface AssetVerdict {
  readonly sha256: string;
  readonly size: number;
}
