import { zipSync, type Zippable } from 'fflate';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash';
import { unpackPackage } from './package-unpack';

const DATASET_TEXT = '{"format":"orn.dataset","schemaVersion":1,"records":{}}\n';
const ASSET_BYTES = new TextEncoder().encode('a tiny fixture image');

async function buildZip(files: Zippable): Promise<Uint8Array> {
  return zipSync(files);
}

async function validManifest(extraFiles: readonly { path: string; bytes: Uint8Array }[] = []): Promise<{ manifest: string; files: Zippable }> {
  const datasetBytes = new TextEncoder().encode(DATASET_TEXT);
  const entries = [{ path: 'dataset.json', sha256: await sha256Hex(datasetBytes) }, ...(await Promise.all(extraFiles.map(async (f) => ({ path: f.path, sha256: await sha256Hex(f.bytes) }))))];
  const manifest = JSON.stringify({ format: 'orn.package', schemaVersion: 1, files: entries });
  const files: Zippable = { 'manifest.json': new TextEncoder().encode(manifest), 'dataset.json': datasetBytes };
  for (const f of extraFiles) files[f.path] = f.bytes;
  return { manifest, files };
}

describe('unpackPackage', () => {
  it('unpacks a valid package: dataset.json text and asset bytes recovered, no issues', async () => {
    const { files } = await validManifest([{ path: 'assets/abc.png', bytes: ASSET_BYTES }]);
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.unpacked.datasetText).toBe(DATASET_TEXT);
    expect(result.unpacked.packageIssues).toEqual([]);
    expect([...result.unpacked.assetBytesBySha256.values()][0]).toEqual(ASSET_BYTES);
  });

  it('a missing manifest.json refuses the whole import', async () => {
    const zip = await buildZip({ 'dataset.json': new TextEncoder().encode(DATASET_TEXT) });
    const result = await unpackPackage(zip);
    expect(result).toMatchObject({ ok: false, code: 'PACKAGE_INVALID' });
  });

  it('a dataset.json whose bytes do not match the manifest hash refuses the whole import', async () => {
    const { files } = await validManifest();
    files['dataset.json'] = new TextEncoder().encode('{"format":"orn.dataset","schemaVersion":1,"records":{"tampered":[]}}\n');
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    expect(result).toMatchObject({ ok: false, code: 'PACKAGE_INVALID' });
  });

  it('a manifest.json that is not readable JSON refuses the whole import', async () => {
    const { files } = await validManifest();
    files['manifest.json'] = new TextEncoder().encode('not json at all {{{');
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    expect(result).toMatchObject({ ok: false, code: 'PACKAGE_INVALID' });
  });

  it('a manifest naming dataset.json with no matching file refuses the whole import', async () => {
    const { files } = await validManifest();
    delete (files as Record<string, unknown>)['dataset.json'];
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    expect(result).toMatchObject({ ok: false, code: 'PACKAGE_INVALID' });
  });

  it('an unreadable (non-zip) blob is refused, not thrown', async () => {
    const result = await unpackPackage(new Uint8Array([1, 2, 3, 4]));
    expect(result).toMatchObject({ ok: false, code: 'PACKAGE_INVALID' });
  });

  it.each([
    ['an absolute path', '/etc/passwd'],
    ['a Windows drive path', 'C:/evil.json'],
    ['a parent-directory escape', 'assets/../../evil.png'],
    ['a backslash', 'assets\\evil.png'],
  ])('refuses an entry name that is %s, reports it, and still imports the rest', async (_label, badName) => {
    const { files } = await validManifest([{ path: 'assets/ok.png', bytes: ASSET_BYTES }]);
    files[badName] = ASSET_BYTES;
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.unpacked.packageIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: badName })]));
    expect(result.unpacked.datasetText).toBe(DATASET_TEXT);
  });

  it('an entry declaring more bytes than its kind is allowed is rejected and reported, package still processes', async () => {
    const bigAsset = new Uint8Array(21 * 1024 * 1024); // over the 20 MB asset cap
    const { files } = await validManifest([{ path: 'assets/big.png', bytes: bigAsset }]);
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.unpacked.packageIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'assets/big.png' })]));
    expect(result.unpacked.assetBytesBySha256.size).toBe(0);
  }, 20_000);

  it('a file present in the package but not named in the manifest is reported and ignored', async () => {
    const { files } = await validManifest();
    files['assets/uninvited.png'] = ASSET_BYTES;
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.unpacked.packageIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'assets/uninvited.png', reason: expect.stringContaining('not named in the manifest') })]),
    );
  });

  it('a manifest entry with no matching file is reported', async () => {
    const { files } = await validManifest([{ path: 'assets/missing.png', bytes: ASSET_BYTES }]);
    delete (files as Record<string, unknown>)['assets/missing.png'];
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.unpacked.packageIssues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'assets/missing.png', reason: expect.stringContaining('no file') })]),
    );
  });

  it('an asset whose bytes do not match the manifest-declared hash is reported, not imported, never thrown', async () => {
    const { files } = await validManifest([{ path: 'assets/x.png', bytes: ASSET_BYTES }]);
    files['assets/x.png'] = new TextEncoder().encode('different bytes than what the manifest hashed');
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.unpacked.assetHashMismatches).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'assets/x.png' })]));
    expect(result.unpacked.assetBytesBySha256.size).toBe(0);
  });

  it('an unexpected top-level path is rejected and reported, never silently extracted', async () => {
    const { files } = await validManifest();
    files['README.txt'] = new TextEncoder().encode('hello');
    const zip = await buildZip(files);
    const result = await unpackPackage(zip);
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.unpacked.packageIssues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'README.txt', reason: expect.stringContaining('unexpected path') })]));
  });
});
