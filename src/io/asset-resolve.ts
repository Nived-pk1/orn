/**
 * Cross-references recovered asset bytes (from a `.ornpkg`'s files or an `.orn.json`'s `embeddedAssets`)
 * against the parsed `asset` records: a hash match with no record, or a magic-byte mismatch, is reported
 * and that one asset's bytes are left out — its record still imports and shows AST-002 later, never silent.
 */
import type { Asset, AnyRecord } from '@/core/schema';
import type { ParsedAsset, RejectedAsset } from './contracts';
import { magicBytesMatch } from './asset-magic';

export function resolveAssets(bytesBySha256: ReadonlyMap<string, Uint8Array>, assetRecords: readonly AnyRecord[]): { readonly assets: readonly ParsedAsset[]; readonly rejected: readonly RejectedAsset[] } {
  const bySha256 = new Map<string, Asset>();
  for (const record of assetRecords as readonly Asset[]) bySha256.set(record.sha256, record);

  const assets: ParsedAsset[] = [];
  const rejected: RejectedAsset[] = [];
  for (const [sha256, bytes] of bytesBySha256) {
    const record = bySha256.get(sha256);
    if (record === undefined) {
      rejected.push({ sha256, reason: 'no asset record in the import references this hash' });
      continue;
    }
    if (!magicBytesMatch(bytes, record.mediaType)) {
      rejected.push({ sha256, assetId: record.id, reason: `bytes do not match the declared media type ${record.mediaType}` });
      continue;
    }
    assets.push({ assetId: record.id, sha256, mediaType: record.mediaType, bytes });
  }
  return { assets, rejected };
}
