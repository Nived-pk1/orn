/**
 * Step 8.4s, S2 (audit DA-01, moved from fable-audit/tests/audit/da-01-embed-roundtrip.test.ts, assertion kept): a one-file backup
 * with pictures "Inside the file" can be imported again, up to the asset cap; a one-file export that would pass the JSON cap is
 * refused with words instead of producing a file nothing can read.
 */
import { describe, expect, it, vi } from 'vitest';
import { migrationRunner } from '@/core/migrations';
import type { CanonicalState } from '@/core/schema';
import { loadFixtureState } from '@/test-support/state-fixture';
import { IMPORT_LIMITS } from './contracts';
import { buildOrnJsonExport } from './export-json';
import { sha256Hex } from './hash';
import { parseImportSource } from './import-source';

vi.setConfig({ testTimeout: 120_000 });

const DEPS = { exportedAt: '2026-11-13T00:00:00.000Z', generator: { app: 'orn-test', version: '1' } };

async function withPicture(size: number): Promise<{ readonly state: CanonicalState; readonly assetId: string; readonly bytes: Uint8Array }> {
  const base = loadFixtureState('maximal-valid');
  const [assetId, asset] = Object.entries(base.records.asset)[0] ?? [];
  if (assetId === undefined || asset === undefined) throw new Error('fixture has no asset');
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < bytes.length; i += 1) bytes[i] = (i * 31) & 0xff;
  const sha256 = await sha256Hex(bytes);
  const state = { ...base, records: { ...base.records, asset: { ...base.records.asset, [assetId]: { ...asset, sha256, mediaType: 'image/png', byteSize: bytes.length } } } } as unknown as CanonicalState;
  return { state, assetId, bytes };
}

describe('an embedded-picture backup round trip (DA-01)', () => {
  it('a backup that embeds an 800 kB picture can be imported again', async () => {
    const { state, assetId, bytes } = await withPicture(800 * 1024);
    const exported = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'embed' }, { ...DEPS, assetBytes: async (id) => (id === assetId ? bytes : undefined) });
    if (!exported.ok) throw new Error(`export failed: ${exported.message}`);
    const result = await parseImportSource({ fileName: 'backup.orn.json', bytes: new Blob([exported.result.bytes as BlobPart]) }, { runner: migrationRunner });
    expect(result.ok ? 'ok' : `${result.code}: ${result.message}`).toBe('ok');
  });

  it('a picture just under the asset cap comes back with every byte', async () => {
    const { state, assetId, bytes } = await withPicture(IMPORT_LIMITS.maxAssetBytes - 3);
    const exported = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'embed' }, { ...DEPS, assetBytes: async (id) => (id === assetId ? bytes : undefined) });
    if (!exported.ok) throw new Error(`export failed: ${exported.message}`);
    const result = await parseImportSource({ fileName: 'backup.orn.json', bytes: new Blob([exported.result.bytes as BlobPart]) }, { runner: migrationRunner });
    if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
    expect(result.result.rejectedAssets).toEqual([]);
    expect(result.result.assets.map((asset) => asset.bytes.length)).toEqual([bytes.length]);
  });

  it('a one-file export that would pass the JSON cap is refused, with the way out in words', async () => {
    const { state, assetId, bytes } = await withPicture(IMPORT_LIMITS.maxAssetBytes - 3);
    const many = {
      ...state,
      records: { ...state.records, asset: Object.fromEntries(['a', 'b', 'c'].map((k) => [`ast_big-${k}`, { ...(state.records.asset[assetId as never] as object), id: `ast_big-${k}` }])) },
    } as unknown as CanonicalState;
    const exported = await buildOrnJsonExport(many, { scope: 'full', includeDependencies: false, assets: 'embed' }, { ...DEPS, assetBytes: async () => bytes });
    expect(exported.ok).toBe(false);
    expect(exported.ok ? '' : exported.message).toBe('This backup is too large for one file. Choose Package (.ornpkg).');
  });
});
