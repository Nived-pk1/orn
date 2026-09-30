/**
 * Synthetic image assets for export tests and benches (step 4.2e). The generator produces no `asset` records, so this adds
 * them: each has a PNG signature (valid magic bytes, `magicBytesMatch`) followed by seeded pseudo-random filler (as
 * incompressible as a real image), a real SHA-256 in its record and its `byteSize`. Deterministic: the same spec gives the
 * same records and bytes. Test-only.
 */
import { produce } from 'immer';
import type { AssetBytesProvider } from '@/io';
import { sha256Hex } from '@/io/hash';
import type { Asset, AssetId, CanonicalState, RecordRef } from '@/core/schema';
import { mulberry32 } from './command-kit';
import { loadFixtureState } from './state-fixture';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export interface SyntheticAssetSpec {
  readonly count: number;
  readonly bytesEach: number;
  readonly seed?: number;
  /** The record asset `i` is attached to (default: none). Scope closures follow attachments. */
  readonly attachTo?: (index: number) => RecordRef | undefined;
}

export interface SyntheticAssets {
  readonly state: CanonicalState;
  readonly bytes: ReadonlyMap<string, Uint8Array>;
  readonly totalBytes: number;
}

/** `length` bytes: the PNG signature, then filler from `next` (a seeded generator). */
export function pngLikeBytes(length: number, next: () => number): Uint8Array {
  const words = new Uint32Array(Math.ceil(length / 4));
  for (let i = 0; i < words.length; i += 1) words[i] = Math.floor(next() * 4294967296) >>> 0;
  const bytes = new Uint8Array(words.buffer, 0, length).slice();
  bytes.set(PNG_SIGNATURE);
  return bytes;
}

const template = (): Asset => {
  const found = Object.values(loadFixtureState('maximal-valid').records.asset)[0];
  if (found === undefined) throw new Error('the maximal fixture has no asset record');
  return found;
};

export async function withSyntheticAssets(state: CanonicalState, spec: SyntheticAssetSpec): Promise<SyntheticAssets> {
  const next = mulberry32(spec.seed ?? 5);
  const base = template();
  const bytes = new Map<string, Uint8Array>();
  const records: Asset[] = [];
  for (let i = 0; i < spec.count; i += 1) {
    const content = pngLikeBytes(spec.bytesEach, next);
    const id = `ast_syn-${String(i).padStart(5, '0')}` as AssetId;
    const attached = spec.attachTo?.(i);
    bytes.set(id, content);
    records.push({
      ...base,
      id,
      byteSize: content.length,
      sha256: await sha256Hex(content),
      filename: `synthetic-${i}.png`,
      attachedTo: attached === undefined ? [] : [{ ref: attached }],
      citations: [],
      provenance: { origin: base.provenance.origin, createdAt: base.provenance.createdAt, updatedAt: base.provenance.updatedAt },
    });
  }
  const next_ = produce(state, (draft) => {
    for (const record of records) (draft.records.asset as Record<string, Asset>)[record.id] = record;
  });
  return { state: next_, bytes, totalBytes: spec.count * spec.bytesEach };
}

/** An `AssetBytesProvider` over a map of bytes by asset ID (an asset not in the map has none). */
export const providerOf = (bytes: ReadonlyMap<string, Uint8Array>): AssetBytesProvider => async (assetId) => bytes.get(assetId);
