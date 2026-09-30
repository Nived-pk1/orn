/**
 * Step 3.10: a legacy `image` (data URL) becomes an `asset` (`legacy_image`, `ast_v6-<first 16 hex of sha256>`) with its bytes
 * carried for the import pipeline; anything undecodable is reported and kept in `provenance.legacy.unmapped`. Expected hashes
 * and bytes come from node:crypto / Buffer, not from the code under test.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AnyRecordSchema, LIMITS, type Asset, type Species } from '@/core/schema';
import { mapLegacy } from '@/test-support/legacy-map-kit';
import { decodeLegacyImage } from './compound-image';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>').toString('base64');
const sha = (b64: string): string => createHash('sha256').update(Buffer.from(b64, 'base64')).digest('hex');
const png = `data:image/png;base64,${PNG}`;

const doc = (compounds: unknown[]) => ({ schemaVersion: 5, compounds, reactions: [] });

describe('decodeLegacyImage', () => {
  it.each([
    ['image/png', PNG],
    ['image/gif', GIF],
    ['image/svg+xml', SVG],
  ])('decodes a base64 %s data URL to exactly its bytes, hash and media type', async (mediaType, b64) => {
    const decoded = await decodeLegacyImage(`data:${mediaType};base64,${b64}`);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.mediaType).toBe(mediaType);
    expect(Buffer.from(decoded.bytes).equals(Buffer.from(b64, 'base64'))).toBe(true);
    expect(decoded.sha256).toBe(sha(b64));
  });

  it('accepts an upper-case media type and extra parameters', async () => {
    expect((await decodeLegacyImage(`data:IMAGE/PNG;name=x.png;base64,${PNG}`)).ok).toBe(true);
  });

  it.each([
    ['not a data URL', 'https://example.org/a.png', 'not a data: URL'],
    ['unsupported media type', `data:image/bmp;base64,${PNG}`, 'is not one of'],
    ['not base64', 'data:image/png,%89PNG', 'only base64 data URLs'],
    ['bad padding', `data:image/png;base64,${PNG.slice(0, -2)}`, 'not valid padded base64'],
    ['whitespace inside', `data:image/png;base64,${PNG.slice(0, 20)}\n${PNG.slice(20)}`, 'not valid padded base64'],
    ['invalid characters', 'data:image/png;base64,@@@@', 'not valid padded base64'],
    ['empty payload', 'data:image/png;base64,', 'not valid padded base64'],
    ['bytes of another type', `data:image/png;base64,${GIF}`, 'do not match the declared media type'],
    ['empty string', '', 'not a data: URL'],
  ])('refuses %s with a reason', async (_name, value, reason) => {
    const decoded = await decodeLegacyImage(value);
    expect(decoded).toMatchObject({ ok: false });
    expect(decoded.ok ? '' : decoded.reason).toContain(reason);
  });

  it('is bounded: a payload over the schema cap is refused before any decoding', async () => {
    const decoded = await decodeLegacyImage(`data:image/png;base64,${'A'.repeat(LIMITS.embeddedAssetBase64 + 4)}`);
    expect(decoded).toMatchObject({ ok: false });
  });
});

describe('images in compounds', () => {
  it('a data URL becomes an asset record (legacy_image) with its bytes; the compound leaf is consumed', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'A', image: png }]));
    const asset = mapped.records.asset[0] as Asset;
    const hex = sha(PNG);
    expect(mapped.records.asset).toHaveLength(1);
    expect(asset).toMatchObject({
      id: `ast_v6-${hex.slice(0, 16)}`,
      kind: 'asset',
      mediaType: 'image/png',
      byteSize: Buffer.from(PNG, 'base64').length,
      sha256: hex,
      assetRole: 'legacy_image',
      attachedTo: [{ ref: { kind: 'species', id: 'spc_v6-c1' } }],
    });
    expect(AnyRecordSchema.safeParse(asset).success).toBe(true);
    expect(mapped.assetBytes).toHaveLength(1);
    expect(mapped.assetBytes[0]).toMatchObject({ assetId: asset.id, sha256: hex, mediaType: 'image/png' });
    expect(Buffer.from(mapped.assetBytes[0]?.bytes ?? new Uint8Array()).equals(Buffer.from(PNG, 'base64'))).toBe(true);
    expect(mapped.consumed.has('compounds[0].image')).toBe(true);
    expect((mapped.records.species[0] as Species).provenance.legacy?.unmapped).toBeUndefined();
    expect(mapped.report.createdCounts.asset).toBe(1);
  });

  it('a hub decided as class carries the image on the class', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'h1', name: 'Hub', nodeType: 'major', image: png }]));
    expect(mapped.records.asset[0]?.attachedTo).toEqual([{ ref: { kind: 'class', id: 'cls_v6-h1' } }]);
  });

  it('one image on several compounds is one asset (content-addressed) attached to each, its bytes carried once', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'A', image: png }, { id: 'c2', name: 'B', image: png }, { id: 'c3', name: 'C', image: `data:image/gif;base64,${GIF}` }]));
    expect(mapped.records.asset.map((a) => [a.mediaType, a.attachedTo.map((t) => t.ref.id)])).toEqual([
      ['image/png', ['spc_v6-c1', 'spc_v6-c2']],
      ['image/gif', ['spc_v6-c3']],
    ]);
    expect(mapped.assetBytes).toHaveLength(2);
  });

  it.each([
    ['not a data URL', 'https://example.org/a.png'],
    ['undecodable base64', 'data:image/png;base64,@@@@'],
    ['bytes of another type', `data:image/png;base64,${GIF}`],
  ])('%s: no asset, the value is kept in legacy.unmapped, the record is review_required, the report counts it', async (_name, image) => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'A', image }]));
    const species = mapped.records.species[0] as Species;
    expect(mapped.records.asset).toEqual([]);
    expect(mapped.assetBytes).toEqual([]);
    expect(species.provenance.legacy?.unmapped).toEqual({ image });
    expect(species.review.status).toBe('review_required');
    expect(species.review.reasons[0]).toContain('image');
    expect(mapped.report.preservedUnmappedFields).toEqual({ image: 1 });
    expect(mapped.report.reviewItems.map((item) => item.subject.id)).toEqual(['spc_v6-c1']);
    expect(mapped.consumed.has('compounds[0].image')).toBe(false);
  });

  it('an image that is not text is kept, not decoded', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'A', image: { url: 'x' } }]));
    expect((mapped.records.species[0] as Species).provenance.legacy?.unmapped).toEqual({ image: { url: 'x' } });
  });

  it('an empty image is nothing: consumed, no asset, no review', async () => {
    const { mapped } = await mapLegacy(doc([{ id: 'c1', name: 'A', image: '' }]));
    expect(mapped.records.asset).toEqual([]);
    expect(mapped.consumed.has('compounds[0].image')).toBe(true);
    expect(mapped.report.reviewItems).toEqual([]);
  });

  it(`the ${LIMITS.attachments + 1}st compound with one image keeps the value instead of overflowing the asset's attachment list`, async () => {
    const compounds = Array.from({ length: LIMITS.attachments + 1 }, (_, i) => ({ id: `c${i}`, name: `N${i}`, image: png }));
    const { mapped } = await mapLegacy(doc(compounds));
    expect(mapped.records.asset[0]?.attachedTo).toHaveLength(LIMITS.attachments);
    const last = mapped.records.species[LIMITS.attachments] as Species;
    expect(last.provenance.legacy?.unmapped).toEqual({ image: png });
    expect(last.review.reasons[0]).toContain('attachments');
    expect(AnyRecordSchema.safeParse(mapped.records.asset[0]).success).toBe(true);
  });
});
