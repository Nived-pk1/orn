/**
 * `.orn.json` export (docs/IMPLEMENTATION_PLAN.md §2 step 3.5): determinism (INV-19), asset embedding,
 * missing-asset reporting, abort and progress.
 */
import { describe, expect, it } from 'vitest';
import { deserializeDocument } from '@/core/dataset';
import type { AssetId } from '@/core/schema';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { AssetBytesProvider } from './contracts';
import { buildOrnJsonExport, type OrnJsonExportDeps } from './export-json';

const state = loadFixtureState('maximal-valid');
const ASSET_ID = 'ast_max-grignard-scheme' as AssetId;
const ASSET_BYTES = new TextEncoder().encode('a tiny fixture placeholder image');

const noBytes: AssetBytesProvider = async () => undefined;
const withBytes: AssetBytesProvider = async (assetId) => (assetId === ASSET_ID ? ASSET_BYTES : undefined);

function deps(assetBytes: AssetBytesProvider = noBytes): OrnJsonExportDeps {
  return { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-test', version: '1' }, assetBytes };
}

describe('buildOrnJsonExport', () => {
  it('INV-19 export is deterministic: the same state, options and clock give byte-identical bytes', async () => {
    const options = { scope: 'full', includeDependencies: false, assets: 'none' } as const;
    const a = await buildOrnJsonExport(state, options, deps());
    const b = await buildOrnJsonExport(state, options, deps());
    if (!a.ok || !b.ok) throw new Error('export failed');
    expect(a.result.bytes).toEqual(b.result.bytes);
  });

  it('parses back to a document scoped and counted correctly, with no embeddedAssets when assets is "none"', async () => {
    const result = await buildOrnJsonExport(state, { scope: 'chemistry', includeDependencies: false, assets: 'none' }, deps());
    if (!result.ok) throw new Error('export failed');
    const text = new TextDecoder().decode(result.result.bytes);
    const parsed = deserializeDocument(text);
    if (!parsed.ok) throw new Error('exported bytes do not parse as a DatasetDocument');
    expect(parsed.document.embeddedAssets).toBeUndefined();
    expect(parsed.document.records.reaction.length).toBe(Object.keys(state.records.reaction).length);
    expect(result.result.counts.reaction).toBe(Object.keys(state.records.reaction).length);
    expect(result.result.missingAssets).toEqual([]);
    expect(result.result.missingReferences).toEqual([]);
  });

  it('embeds asset bytes as base64 when assets is "embed", byte-identical after decoding', async () => {
    const result = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'embed' }, deps(withBytes));
    if (!result.ok) throw new Error('export failed');
    const parsed = deserializeDocument(new TextDecoder().decode(result.result.bytes));
    if (!parsed.ok) throw new Error('exported bytes do not parse');
    const embedded = parsed.document.embeddedAssets?.find((entry) => entry.assetId === ASSET_ID);
    expect(embedded).toBeDefined();
    const decoded = Uint8Array.from(atob(embedded?.base64 ?? ''), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(ASSET_BYTES);
    expect(result.result.missingAssets).toEqual([]);
  });

  it('a provider that cannot supply bytes is reported in missingAssets, never thrown or silently dropped', async () => {
    const result = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'embed' }, deps(noBytes));
    if (!result.ok) throw new Error('export failed');
    expect(result.result.missingAssets).toEqual([{ assetId: ASSET_ID, sha256: expect.any(String), reason: 'no_bytes' }]);
    const parsed = deserializeDocument(new TextDecoder().decode(result.result.bytes));
    if (!parsed.ok) throw new Error('exported bytes do not parse');
    expect(parsed.document.embeddedAssets).toBeUndefined();
  });

  it('assets: "none" never calls the provider (nothing to report as missing)', async () => {
    let calls = 0;
    const counting: AssetBytesProvider = async (id, sha) => {
      calls += 1;
      return withBytes(id, sha);
    };
    const result = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, deps(counting));
    expect(calls).toBe(0);
    if (!result.ok) throw new Error('export failed');
    expect(result.result.missingAssets).toEqual([]);
  });

  it('an already-aborted signal returns CANCELLED with no bytes', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'embed' }, deps(withBytes), { signal: controller.signal });
    expect(result).toEqual({ ok: false, code: 'CANCELLED', message: expect.any(String) });
  });

  it('a signal aborted after asset embedding (before the final serialise) still returns CANCELLED with no bytes', async () => {
    const controller = new AbortController();
    const abortAfterFetch: AssetBytesProvider = async (id, sha) => {
      const bytes = await withBytes(id, sha);
      controller.abort();
      return bytes;
    };
    const result = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'embed' }, deps(abortAfterFetch), { signal: controller.signal });
    expect(result).toEqual({ ok: false, code: 'CANCELLED', message: expect.any(String) });
  });

  it('reports progress once per embedded asset plus once for the final serialise', async () => {
    const progress: { done: number; total: number | undefined; note: string | undefined }[] = [];
    const result = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'embed' }, deps(withBytes), {
      onProgress: (done, total, note) => progress.push({ done, total, note }),
    });
    expect(result.ok).toBe(true);
    expect(progress).toEqual([
      { done: 1, total: 2, note: expect.stringContaining(ASSET_ID) },
      { done: 2, total: 2, note: 'serialize' },
    ]);
  });
});
