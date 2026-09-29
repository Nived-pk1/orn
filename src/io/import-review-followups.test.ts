/**
 * Step 3.6 review follow-ups (docs/PROGRESS.md "Step 3.6 review"): the `.ornpkg` entry-count cap (b), embedded-asset
 * problems reported instead of skipped (c), the legacy payload kept complete (d), and a record filed under the wrong
 * envelope group reported (e).
 */
import { zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { migrationRunner } from '@/core/migrations';
import { buildOrnJsonExport } from '@/io';
import { loadFixtureState } from '@/test-support/state-fixture';
import { IMPORT_LIMITS, type ImportSource } from './contracts';
import { sha256Hex } from './hash';
import { parseImportSource } from './import-source';
import { unpackPackage } from './package-unpack';

const deps = { runner: migrationRunner };
const state = loadFixtureState('maximal-valid');
const exportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-test', version: '1' }, assetBytes: async () => undefined };
const enc = new TextEncoder();

const sourceOf = (text: string): ImportSource => ({ fileName: 'x.orn.json', bytes: new Blob([enc.encode(text)]) });

async function exportedDataset(): Promise<{ records: Record<string, unknown[]>; embeddedAssets?: unknown } & Record<string, unknown>> {
  const exported = await buildOrnJsonExport(state, { scope: 'full', includeDependencies: false, assets: 'none' }, exportDeps);
  if (!exported.ok) throw new Error('export failed');
  return JSON.parse(new TextDecoder().decode(exported.result.bytes)) as { records: Record<string, unknown[]> } & Record<string, unknown>;
}

describe('item b: .ornpkg entry-count cap', () => {
  it('IMPORT_LIMITS.maxPackageEntries is the classic-zip maximum (16-bit entry count)', () => {
    expect(IMPORT_LIMITS.maxPackageEntries).toBe(65_535);
  });

  it('a package with more entries than the cap is refused as a whole, before anything is inflated', async () => {
    const files: Zippable = { 'manifest.json': enc.encode('{}'), 'dataset.json': enc.encode('{}') };
    for (let i = 0; i < 10; i += 1) files[`assets/${i}`] = enc.encode('x');
    const zip = zipSync(files); // 12 entries
    expect(await unpackPackage(zip, { maxEntries: 11 })).toMatchObject({ ok: false, code: 'PACKAGE_INVALID', message: expect.stringContaining('more than 11 entries') });
    // At exactly the cap the entries are read (this manifest is not a real one, so it is refused for THAT reason, not the count).
    expect(await unpackPackage(zip, { maxEntries: 12 })).toMatchObject({ ok: false, message: expect.stringContaining('manifest') });
  });

  it('a real package well under the default cap is unaffected (default limits apply)', async () => {
    const dataset = enc.encode('{"format":"orn.dataset","schemaVersion":1,"records":{}}');
    const manifest = { format: 'orn.package', schemaVersion: 1, files: [{ path: 'dataset.json', sha256: await sha256Hex(dataset) }] };
    const result = await unpackPackage(zipSync({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'dataset.json': dataset }));
    expect(result.ok).toBe(true);
  });
});

describe('item c: embedded-asset problems are reported, never silent', () => {
  it('bytes that do not hash to the record\'s SHA-256, an unknown asset ID and a malformed entry each produce a RejectedAsset', async () => {
    const record = state.records.asset['ast_max-grignard-scheme'];
    if (record === undefined) throw new Error('fixture asset missing');
    const dataset = await exportedDataset();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9]);
    dataset.embeddedAssets = [
      { assetId: record.id, base64: Buffer.from(png).toString('base64') }, // valid base64, wrong hash (fixture hash is a placeholder)
      { assetId: 'ast_not-in-this-file', base64: 'AAAA' },
      { base64: 'AAAA' },
    ];
    const outcome = await parseImportSource(sourceOf(JSON.stringify(dataset)), deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.assets).toEqual([]);
    expect(outcome.result.rejectedAssets).toEqual([
      { sha256: record.sha256, assetId: record.id, reason: "embedded bytes do not match the record's SHA-256" },
      { sha256: '', reason: 'embeddedAssets[1] (ast_not-in-this-file): no asset record with that ID in the import' },
      { sha256: '', reason: 'embeddedAssets[2] has no string assetId and base64' },
    ]);
    expect(outcome.result.counts.asset).toBe(Object.keys(state.records.asset).length);
  });

  it('an embeddedAssets value that is not an array is reported', async () => {
    const dataset = await exportedDataset();
    dataset.embeddedAssets = { nope: true };
    const outcome = await parseImportSource(sourceOf(JSON.stringify(dataset)), deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.rejectedAssets).toEqual([{ sha256: '', reason: 'embeddedAssets is not an array; no embedded bytes were read' }]);
  });

  it('a package asset file whose bytes are not what the manifest declares is already reported (unchanged behaviour)', async () => {
    const dataset = await exportedDataset();
    const datasetBytes = enc.encode(JSON.stringify(dataset));
    const manifest = { format: 'orn.package', schemaVersion: 1, files: [{ path: 'dataset.json', sha256: await sha256Hex(datasetBytes) }, { path: 'assets/abc.png', sha256: 'f'.repeat(64) }] };
    const zip = zipSync({ 'manifest.json': enc.encode(JSON.stringify(manifest)), 'dataset.json': datasetBytes, 'assets/abc.png': new Uint8Array([1, 2, 3]) });
    const outcome = await parseImportSource({ fileName: 'x.ornpkg', bytes: new Blob([zip as BlobPart]) }, deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.rejectedAssets).toHaveLength(1);
  });
});

describe('item d: legacyPayload is the COMPLETE sanitised parsed value', () => {
  it('a large, deep legacy v6 export comes back deep-equal to what JSON.parse gives (nothing truncated or shortened)', async () => {
    let deep: unknown = 'leaf';
    for (let i = 0; i < 55; i += 1) deep = { child: deep };
    const payload = {
      schemaVersion: 5,
      compounds: Array.from({ length: 3_000 }, (_, i) => ({ id: `c${i}`, name: `Compound ${i}`, tags: ['a', 'b', 'c'], nested: { n: i } })),
      reactions: [{ id: 'r1', big: 'x'.repeat(900_000), deep }],
      extra: { zeroes: [0, 0, 0], empty: {}, nulls: [null], flags: [true, false] },
    };
    const outcome = await parseImportSource(sourceOf(JSON.stringify(payload)), deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.format).toBe('legacy_v6');
    expect(outcome.result.unsafeKeysRenamed).toEqual([]);
    expect(outcome.result.legacyPayload).toEqual(payload);
  });

  it('with an unsafe key present, the payload differs from the input ONLY by that key\'s rename, and the rename is reported', async () => {
    const text = '{"schemaVersion":5,"compounds":[{"id":"c1","__proto__":{"x":1}}],"reactions":[{"id":"r1"}]}';
    const outcome = await parseImportSource(sourceOf(text), deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.legacyPayload).toEqual({ schemaVersion: 5, compounds: [{ id: 'c1', __unsafe_key____proto__: { x: 1 } }], reactions: [{ id: 'r1' }] });
    expect(outcome.result.unsafeKeysRenamed).toHaveLength(1);
  });
});

describe('item e: a record listed under the wrong envelope group', () => {
  it('still imports under its OWN kind, and the mismatch is reported', async () => {
    const dataset = await exportedDataset();
    const concept = dataset.records['concept']?.[0] as { id: string } | undefined;
    if (concept === undefined) throw new Error('fixture has no concept');
    dataset.records['concept'] = (dataset.records['concept'] ?? []).slice(1);
    dataset.records['species'] = [...(dataset.records['species'] ?? []), concept];
    const outcome = await parseImportSource(sourceOf(JSON.stringify(dataset)), deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.records.concept?.map((r) => r.id)).toContain(concept.id);
    expect(outcome.result.quarantined).toEqual([]);
    expect(outcome.result.kindMismatches).toEqual([{ id: concept.id, envelopeKind: 'species', ownKind: 'concept' }]);
  });

  it('a clean file reports no mismatch', async () => {
    const outcome = await parseImportSource(sourceOf(JSON.stringify(await exportedDataset())), deps);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.result.kindMismatches).toEqual([]);
  });
});
