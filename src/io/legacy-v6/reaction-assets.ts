/**
 * Images of reactions and reaction participants (docs/MIGRATION.md §4.5): a legacy `image` data URL becomes an `asset` attached to
 * the REACTION (the participant's label, or failing that its compound reference, is the attachment's note). Same strict decode and
 * the same ID rule as compound images (`ast_v6-<first 16 hex of sha256>`): one image used by a compound and by a reaction is ONE
 * asset with two attachments. An asset the compound mapper already created is never mutated: the book returns a changed COPY
 * (`updated`) which the merge step puts in its place. Bounded: at most `LIMITS.attachments` attachments per asset.
 */
import { LIMITS, ShortTextSchema, type Asset, type RecordRef } from '@/core/schema';
import type { ParsedAsset } from '../contracts';
import { assetRecord, type Stamp } from './compound-records';
import { decodeLegacyImage } from './compound-image';
import { legacyAssetId } from './id-space';

export type AttachResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface AssetBook {
  /** Decodes `value` and attaches it to `target`. `ok: false` says why nothing was attached (the caller keeps the value in `unmapped`). */
  attach(value: string, target: RecordRef, note: string | undefined, legacyId: string | undefined): Promise<AttachResult>;
  /** Assets made by the reaction mapper, in first-use order. */
  created(): Asset[];
  /** Assets of the compound mapper that gained an attachment (a copy each), in first-use order. */
  updated(): Asset[];
  /** Bytes of the assets in `created()`. */
  bytes(): ParsedAsset[];
}

export function createAssetBook(existing: readonly Asset[], stamp: Stamp): AssetBook {
  const known = new Map(existing.map((asset) => [asset.id as string, asset] as const));
  const created = new Map<string, Asset>();
  const updated = new Map<string, Asset>();
  const bytes: ParsedAsset[] = [];
  return {
    async attach(value, target, note, legacyId) {
      const decoded = await decodeLegacyImage(value);
      if (!decoded.ok) return { ok: false, reason: `image could not be imported (${decoded.reason})` };
      const id = legacyAssetId(decoded.sha256);
      const attachment = { ref: target, ...(note !== undefined && ShortTextSchema.safeParse(note).success ? { note } : {}) };
      const current = created.get(id) ?? updated.get(id) ?? known.get(id);
      if (current === undefined) {
        const asset = assetRecord(id, { mediaType: decoded.mediaType, byteSize: decoded.bytes.length, sha256: decoded.sha256 }, target, stamp, legacyId);
        asset.attachedTo[0] = attachment;
        created.set(id, asset);
        bytes.push({ assetId: id as ParsedAsset['assetId'], sha256: decoded.sha256, mediaType: decoded.mediaType, bytes: decoded.bytes });
        return { ok: true };
      }
      if (current.attachedTo.length >= LIMITS.attachments) return { ok: false, reason: `the image already has ${LIMITS.attachments} attachments` };
      if (created.has(id)) {
        current.attachedTo.push(attachment);
      } else {
        const copy = updated.get(id) ?? ({ ...current, attachedTo: [...current.attachedTo] } as Asset);
        copy.attachedTo.push(attachment);
        updated.set(id, copy);
      }
      return { ok: true };
    },
    created: () => [...created.values()],
    updated: () => [...updated.values()],
    bytes: () => [...bytes],
  };
}
