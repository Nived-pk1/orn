/**
 * Top-level import parse (IMPLEMENTATION_PLAN.md §2 step 3.6): caps, safe parse, format detection,
 * `.ornpkg` unpack, migration, per-record L1, quarantine and asset verification, end to end. ADV-031's L2
 * half (a wrong-kind reference caught only at L2) is step 3.7's — this step only ever runs L1.
 */
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { migrationRunner } from '@/core/migrations';
import { buildOrnJsonExport, buildOrnPackageExport } from '@/io';
import { loadFixtureState } from '@/test-support/state-fixture';
import { SYNTHETIC_STEPS } from '@/test-support/synthetic-migration';
import { withVersionOffset } from '@/test-support/version-offset';
import { IMPORT_LIMITS, type ImportSource } from './contracts';
import { sha256Hex } from './hash';
import { parseImportSource } from './import-source';

const deps = { runner: migrationRunner };
const state = loadFixtureState('maximal-valid');
const exportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-test', version: '1' }, assetBytes: async () => undefined };

function sourceOf(bytes: Uint8Array, fileName = 'import.orn.json'): ImportSource {
  return { fileName, bytes: new Blob([bytes as BlobPart]) };
}

/**
 * A Blob-shaped stand-in whose reported `.size` is over a cap: `.slice(0, 4)` (the cheap, bounded container
 * sniff every source needs before its cap even applies) is allowed, but reading the WHOLE content throws —
 * proving the cap is checked before the potentially-huge body is ever read.
 */
function oversizedBlob(size: number): Blob {
  const boom = (): never => {
    throw new Error('must not read the whole Blob past its size check');
  };
  return {
    size,
    slice: (start?: number, end?: number) => (start === 0 && end === 4 ? new Blob([new TextEncoder().encode('{"a"')]) : boom()),
    text: boom,
    arrayBuffer: boom,
  } as unknown as Blob;
}

describe('parseImportSource — .orn.json', () => {
  it('a real .orn.json exported from the maximal fixture round-trips: format, counts, no quarantine, no unsafe keys', async () => {
    const exported = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, exportDeps);
    if (!exported.ok) throw new Error('export failed');
    const result = await parseImportSource({ fileName: 'x.orn.json', bytes: new Blob([exported.result.bytes as BlobPart]) }, deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.format).toBe('orn.dataset');
    expect(result.result.quarantined).toEqual([]);
    expect(result.result.unsafeKeysRenamed).toEqual([]);
    for (const kind of Object.keys(state.records) as (keyof typeof state.records)[]) {
      expect(result.result.counts[kind]).toBe(Object.keys(state.records[kind]).length);
    }
  });

  it('a genuinely matching embedded asset (base64) is recovered and verified, keyed by its record\'s declared sha256', async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const realSha256 = await sha256Hex(pngBytes);
    const originalAsset = state.records.asset['ast_max-grignard-scheme'];
    if (originalAsset === undefined) throw new Error('fixture asset missing');
    const withMatchingRecord = { ...state, records: { ...state.records, asset: { ...state.records.asset, 'ast_max-grignard-scheme': { ...originalAsset, sha256: realSha256, byteSize: pngBytes.length } } } };
    const exported = await buildOrnJsonExport(withMatchingRecord, { scope: 'full', includeDependencies: false, assets: 'embed' }, { ...exportDeps, assetBytes: async () => pngBytes });
    if (!exported.ok) throw new Error('export failed');
    const result = await parseImportSource({ fileName: 'x.orn.json', bytes: new Blob([exported.result.bytes as BlobPart]) }, deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.assets).toEqual([{ assetId: 'ast_max-grignard-scheme', sha256: realSha256, mediaType: 'image/png', bytes: pngBytes }]);
    expect(result.result.rejectedAssets).toEqual([]);
  });

  it('malformed base64 in an embedded asset is skipped, never thrown, and the rest of the import still succeeds', async () => {
    const validAsset = state.records.asset['ast_max-grignard-scheme'];
    if (validAsset === undefined) throw new Error('fixture asset missing');
    const exported = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, exportDeps);
    if (!exported.ok) throw new Error('export failed');
    const dataset = JSON.parse(new TextDecoder().decode(exported.result.bytes)) as { embeddedAssets?: unknown };
    dataset.embeddedAssets = [{ assetId: validAsset.id, base64: 'not valid base64 !!!' }];
    const result = await parseImportSource(sourceOf(new TextEncoder().encode(`${JSON.stringify(dataset)}\n`)), deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.assets).toEqual([]);
    expect(result.result.rejectedAssets).toEqual([]);
    expect(result.result.counts.asset).toBe(Object.keys(state.records.asset).length);
  });

  it('ADV-035: unsafe keys anywhere in the file are renamed, reported, and Object.prototype is never touched', async () => {
    const text = '{"format":"orn.dataset","schemaVersion":1,"records":{"concept":[{"__proto__":{"polluted":true},"kind":"concept","id":"cpt_x"}]}}';
    const result = await parseImportSource(sourceOf(new TextEncoder().encode(text)), deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.unsafeKeysRenamed.length).toBeGreaterThan(0);
    expect((Object.prototype as unknown as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('ADV-041 file part: a newer schema version in the file is refused with an explanation', async () => {
    const runner = withVersionOffset(SYNTHETIC_STEPS, 1); // exposed target 1
    const text = '{"format":"orn.dataset","schemaVersion":9,"records":{}}';
    const result = await parseImportSource(sourceOf(new TextEncoder().encode(text)), { runner });
    expect(result).toMatchObject({ ok: false, code: 'NEWER_SCHEMA', message: expect.any(String) });
  });

  it('detects a v6 legacy export and carries the raw payload for step 3.8, without touching quarantine/L1', async () => {
    const text = JSON.stringify({ compounds: [{ id: 'c1' }], reactions: [{ id: 'r1' }], schemaVersion: 5 });
    const result = await parseImportSource(sourceOf(new TextEncoder().encode(text)), deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.format).toBe('legacy_v6');
    expect(result.result.legacyPayload).toBeDefined();
    expect(result.result.quarantined).toEqual([]);
  });

  it('detects v4 prototype data (a reaction with no participants array)', async () => {
    const text = JSON.stringify({ reactions: [{ id: 'r1', start: 'a', end: 'b' }] });
    const result = await parseImportSource(sourceOf(new TextEncoder().encode(text)), deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.format).toBe('legacy_v4');
  });

  it('refuses an unrecognised shape with a reason, never a guess', async () => {
    const result = await parseImportSource(sourceOf(new TextEncoder().encode('{"nonsense":true}')), deps);
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_FORMAT' });
  });

  it('ADV-032 io part: a file over the JSON byte cap is refused WITHOUT the Blob ever being read', async () => {
    const source: ImportSource = { fileName: 'huge.orn.json', bytes: oversizedBlob(IMPORT_LIMITS.maxJsonBytes + 1) };
    const result = await parseImportSource(source, deps);
    expect(result).toMatchObject({ ok: false, code: 'FILE_TOO_LARGE' });
  });

  it('ADV-032 io part: depth over the cap is rejected end to end, without a stack overflow', async () => {
    const text = `${'['.repeat(100)}1${']'.repeat(100)}`;
    const result = await parseImportSource(sourceOf(new TextEncoder().encode(text)), deps);
    expect(result).toMatchObject({ ok: false, code: 'TOO_DEEP' });
  });

  it('ADV-032 io part: a 5 MB string literal is rejected end to end', async () => {
    const text = `{"format":"orn.dataset","schemaVersion":1,"records":{"concept":[{"notes":"${'x'.repeat(5 * 1024 * 1024)}"}]}}`;
    const result = await parseImportSource(sourceOf(new TextEncoder().encode(text)), deps);
    expect(result).toMatchObject({ ok: false, code: 'STRING_TOO_LONG' });
  }, 20_000);

  it('an already-aborted signal returns CANCELLED, with no partial result', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await parseImportSource(sourceOf(new TextEncoder().encode('{"format":"orn.dataset","schemaVersion":1,"records":{}}')), deps, { signal: controller.signal });
    expect(result).toEqual({ ok: false, code: 'CANCELLED', message: expect.any(String) });
  });

  it('reports progress through the JSON path', async () => {
    const progress: number[] = [];
    const result = await parseImportSource(sourceOf(new TextEncoder().encode('{"format":"orn.dataset","schemaVersion":1,"records":{}}')), deps, { onProgress: (done) => progress.push(done) });
    expect(result.ok).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });
});

describe('parseImportSource — .ornpkg', () => {
  it("a package whose dataset.json is not an orn.dataset document is refused (UNKNOWN_FORMAT), never guessed", async () => {
    const datasetBytes = new TextEncoder().encode(JSON.stringify({ compounds: [], reactions: [{ id: 'r1' }], schemaVersion: 5 })); // a v6 shape, never valid package content
    const manifest = JSON.stringify({ format: 'orn.package', schemaVersion: 1, files: [{ path: 'dataset.json', sha256: await sha256Hex(datasetBytes) }] });
    const zip = zipSync({ 'manifest.json': new TextEncoder().encode(manifest), 'dataset.json': datasetBytes });
    const result = await parseImportSource({ fileName: 'x.ornpkg', bytes: new Blob([zip as BlobPart]) }, deps);
    expect(result).toMatchObject({ ok: false, code: 'UNKNOWN_FORMAT' });
  });

  it('a real .ornpkg exported from the maximal fixture round-trips: format, counts, no quarantine', async () => {
    const exported = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, exportDeps);
    if (!exported.ok) throw new Error('export failed');
    const result = await parseImportSource({ fileName: 'x.ornpkg', bytes: new Blob([exported.result.bytes as BlobPart]) }, deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.format).toBe('orn.package');
    expect(result.result.quarantined).toEqual([]);
    expect(result.result.packageIssues).toEqual([]);
    for (const kind of Object.keys(state.records) as (keyof typeof state.records)[]) {
      expect(result.result.counts[kind]).toBe(Object.keys(state.records[kind]).length);
    }
  });

  it('a package whose one asset file genuinely matches its record (hash AND magic bytes) is recovered and verified', async () => {
    // The maximal fixture's own asset.sha256 is a fixture placeholder, not tied to any real bytes (its
    // export uses the DECLARED hash, not a computed one — step 3.5, unchanged here). This test instead
    // hand-builds a package where the file and the record genuinely agree, exercising the full recovery path.
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const realSha256 = await sha256Hex(pngBytes);
    const assetRecord = { ...state.records.asset['ast_max-grignard-scheme'], sha256: realSha256, byteSize: pngBytes.length };
    const datasetDoc = { ...(await buildOrnJsonExport(state, { scope: 'chemistry', includeDependencies: true, assets: 'none' }, exportDeps)) };
    if (!datasetDoc.ok) throw new Error('export failed');
    const dataset = JSON.parse(new TextDecoder().decode(datasetDoc.result.bytes)) as { records: { asset: unknown[] } };
    dataset.records.asset = [assetRecord];
    const datasetText = `${JSON.stringify(dataset, null, 2)}\n`;
    const datasetBytes = new TextEncoder().encode(datasetText);
    const manifest = JSON.stringify({
      format: 'orn.package',
      schemaVersion: 1,
      files: [
        { path: 'dataset.json', sha256: await sha256Hex(datasetBytes) },
        { path: `assets/${realSha256}.png`, sha256: realSha256 },
      ],
    });
    const zip = zipSync({
      'manifest.json': new TextEncoder().encode(manifest),
      'dataset.json': datasetBytes,
      [`assets/${realSha256}.png`]: pngBytes,
    });
    const result = await parseImportSource({ fileName: 'x.ornpkg', bytes: new Blob([zip as BlobPart]) }, deps);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.result.assets).toEqual([{ assetId: assetRecord.id, sha256: realSha256, mediaType: 'image/png', bytes: pngBytes }]);
    expect(result.result.rejectedAssets).toEqual([]);
  });

  it('ADV-032 io part: a package over the package byte cap is refused WITHOUT the Blob ever being read', async () => {
    const source: ImportSource = { fileName: 'huge.ornpkg', bytes: oversizedBlob(IMPORT_LIMITS.maxPackageBytes + 1) };
    const result = await parseImportSource(source, deps);
    expect(result).toMatchObject({ ok: false, code: 'FILE_TOO_LARGE' });
  });

  it('reports progress through the package path', async () => {
    const exported = await buildOrnPackageExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, exportDeps);
    if (!exported.ok) throw new Error('export failed');
    const progress: number[] = [];
    const result = await parseImportSource({ fileName: 'x.ornpkg', bytes: new Blob([exported.result.bytes as BlobPart]) }, deps, { onProgress: (done) => progress.push(done) });
    expect(result.ok).toBe(true);
    expect(progress.length).toBeGreaterThan(0);
  });
});
