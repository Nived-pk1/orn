/**
 * `.ornpkg` export (docs/IMPLEMENTATION_PLAN.md §2 step 3.5): determinism (INV-19, fixed mtime, fixed entry
 * order), manifest shape, missing-asset reporting, abort and progress.
 */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { deserializeDocument } from '@/core/dataset';
import type { AssetId } from '@/core/schema';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { AssetBytesProvider } from './contracts';
import { buildOrnPackageExport, type OrnPackageExportDeps } from './export-package';

const state = loadFixtureState('maximal-valid');
const ASSET_ID = 'ast_max-grignard-scheme' as AssetId;
const ASSET_BYTES = new TextEncoder().encode('a tiny fixture placeholder image');

const noBytes: AssetBytesProvider = async () => undefined;
const withBytes: AssetBytesProvider = async (assetId) => (assetId === ASSET_ID ? ASSET_BYTES : undefined);

function deps(assetBytes: AssetBytesProvider = noBytes): OrnPackageExportDeps {
  return { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-test', version: '1' }, assetBytes };
}

describe('buildOrnPackageExport', () => {
  it('INV-19 export is deterministic: the same state, options and clock give byte-identical bytes (fixed mtime, fixed entry order)', async () => {
    const options = { scope: 'full', includeDependencies: false, assets: 'package' } as const;
    const a = await buildOrnPackageExport(state, options, deps(withBytes));
    const b = await buildOrnPackageExport(state, options, deps(withBytes));
    if (!a.ok || !b.ok) throw new Error('export failed');
    expect(a.result.bytes).toEqual(b.result.bytes);
  });

  it('unpacks to manifest.json (format, schemaVersion, one entry per file with sha256), dataset.json and assets/<sha256>.<ext>, in that entry order', async () => {
    const result = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'package' }, deps(withBytes));
    if (!result.ok) throw new Error('export failed');
    const files = unzipSync(result.result.bytes);
    expect(Object.keys(files)).toEqual(['manifest.json', 'dataset.json', `assets/${'497790947d4666760ce38f3c00e852c71fdb66cae849bae8e9ede352719e1581'.slice(0, 64)}.png`]);
    const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json'])) as { format: string; schemaVersion: number; files: { path: string; sha256: string }[] };
    expect(manifest.format).toBe('orn.package');
    expect(manifest.files.map((f) => f.path)).toEqual(['dataset.json', expect.stringMatching(/^assets\/[0-9a-f]{64}\.png$/)]);
    const parsedDataset = deserializeDocument(new TextDecoder().decode(files['dataset.json']));
    if (!parsedDataset.ok) throw new Error('dataset.json does not parse');
    expect(parsedDataset.document.records.asset.length).toBe(1);
    const assetFile = Object.entries(files).find(([path]) => path.startsWith('assets/'));
    expect(assetFile?.[1]).toEqual(ASSET_BYTES);
  });

  it('assets: "none" writes no asset files and no asset entries in the manifest', async () => {
    const result = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, deps(withBytes));
    if (!result.ok) throw new Error('export failed');
    const files = unzipSync(result.result.bytes);
    expect(Object.keys(files)).toEqual(['manifest.json', 'dataset.json']);
  });

  it('a provider that cannot supply bytes is reported in missingAssets, never thrown, and the zip has no file for it', async () => {
    const result = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'package' }, deps(noBytes));
    if (!result.ok) throw new Error('export failed');
    expect(result.result.missingAssets).toEqual([{ assetId: ASSET_ID, sha256: expect.any(String) }]);
    const files = unzipSync(result.result.bytes);
    expect(Object.keys(files)).toEqual(['manifest.json', 'dataset.json']);
  });

  it('an already-aborted signal returns CANCELLED with no bytes', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'package' }, deps(withBytes), { signal: controller.signal });
    expect(result).toEqual({ ok: false, code: 'CANCELLED', message: expect.any(String) });
  });

  it('a signal aborted after asset collection (before the final zip step) still returns CANCELLED with no bytes', async () => {
    const controller = new AbortController();
    const abortAfterFetch: AssetBytesProvider = async (id, sha) => {
      const bytes = await withBytes(id, sha);
      controller.abort();
      return bytes;
    };
    const result = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'package' }, deps(abortAfterFetch), { signal: controller.signal });
    expect(result).toEqual({ ok: false, code: 'CANCELLED', message: expect.any(String) });
  });

  it('reports progress once per included asset plus once for the final zip step', async () => {
    const progress: { done: number; total: number | undefined; note: string | undefined }[] = [];
    const result = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'package' }, deps(withBytes), {
      onProgress: (done, total, note) => progress.push({ done, total, note }),
    });
    expect(result.ok).toBe(true);
    expect(progress).toEqual([
      { done: 1, total: 2, note: expect.stringContaining(ASSET_ID) },
      { done: 2, total: 2, note: 'zip' },
    ]);
  });
});
