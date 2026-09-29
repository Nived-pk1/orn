import { describe, expect, it } from 'vitest';
import type { Asset } from '@/core/schema';
import { resolveAssets } from './asset-resolve';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function assetRecord(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'ast_x' as Asset['id'],
    kind: 'asset',
    mediaType: 'image/png',
    byteSize: PNG.length,
    sha256: 'a'.repeat(64),
    assetRole: 'reaction_image',
    attachedTo: [],
    tags: [],
    citations: [],
    provenance: { origin: 'user', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    review: { lifecycle: 'published', status: 'ok' },
    ...overrides,
  } as unknown as Asset;
}

describe('resolveAssets', () => {
  it('matches bytes to their record by sha256, verified by magic bytes', () => {
    const record = assetRecord();
    const { assets, rejected } = resolveAssets(new Map([[record.sha256, PNG]]), [record]);
    expect(assets).toEqual([{ assetId: record.id, sha256: record.sha256, mediaType: 'image/png', bytes: PNG }]);
    expect(rejected).toEqual([]);
  });

  it('a hash with no matching asset record is reported, not silently dropped', () => {
    const { assets, rejected } = resolveAssets(new Map([['deadbeef'.repeat(8), PNG]]), []);
    expect(assets).toEqual([]);
    expect(rejected).toEqual([{ sha256: 'deadbeef'.repeat(8), reason: expect.stringContaining('no asset record') }]);
  });

  it('bytes that do not match the record\'s declared media type are rejected, not imported', () => {
    const record = assetRecord({ mediaType: 'image/jpeg' as Asset['mediaType'] });
    const { assets, rejected } = resolveAssets(new Map([[record.sha256, PNG]]), [record]);
    expect(assets).toEqual([]);
    expect(rejected).toEqual([{ sha256: record.sha256, assetId: record.id, reason: expect.stringContaining('image/jpeg') }]);
  });

  it('an empty input resolves nothing and rejects nothing', () => {
    expect(resolveAssets(new Map(), [])).toEqual({ assets: [], rejected: [] });
  });
});
