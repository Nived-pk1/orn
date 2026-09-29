/**
 * SHA-256 of a Blob, lowercase hex, for the content-addressed `assetBlobs` store (docs/PERSISTENCE.md §5). Async on
 * purpose: it can never run inside an IndexedDB transaction (awaiting it would end the transaction), so writers
 * verify BEFORE opening one. `src/io` has its own byte-array helper; persistence and io never import each other.
 */
export async function sha256OfBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
