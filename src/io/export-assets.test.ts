/**
 * Step 4.2e review, follow-up a: why an asset's bytes are missing. `undefined` is `no_bytes`; a throw is `read_failed` with the
 * error's text, capped; both exporters report it and go on.
 */
import { describe, expect, it } from 'vitest';
import type { AssetId } from '@/core/schema';
import { loadFixtureState } from '@/test-support/state-fixture';
import { MISSING_ASSET_MESSAGE_CAP, type AssetBytesProvider } from './contracts';
import { readAssetBytes } from './export-assets';
import { buildOrnJsonExport } from './export-json';
import { buildOrnPackageExport } from './export-package';

const ID = 'ast_x' as AssetId;
const SHA = 'a'.repeat(64);

describe('readAssetBytes', () => {
  it('bytes are returned as they are', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(await readAssetBytes(async () => bytes, ID, SHA)).toEqual({ ok: true, bytes });
  });

  it('undefined is no_bytes, with no message', async () => {
    expect(await readAssetBytes(async () => undefined, ID, SHA)).toEqual({ ok: false, missing: { assetId: ID, sha256: SHA, reason: 'no_bytes' } });
  });

  it('a rejected promise is read_failed with the error message', async () => {
    const out = await readAssetBytes(async () => Promise.reject(new Error('disk on fire')), ID, SHA);
    expect(out).toEqual({ ok: false, missing: { assetId: ID, sha256: SHA, reason: 'read_failed', message: 'disk on fire' } });
  });

  it('a synchronous throw and a non-error value are read_failed too', async () => {
    const sync = (() => {
      throw new Error('sync boom');
    }) as unknown as AssetBytesProvider;
    expect(await readAssetBytes(sync, ID, SHA)).toMatchObject({ ok: false, missing: { reason: 'read_failed', message: 'sync boom' } });
    expect(await readAssetBytes(async () => Promise.reject('plain text'), ID, SHA)).toMatchObject({ missing: { reason: 'read_failed', message: 'plain text' } });
    expect(await readAssetBytes(async () => Promise.reject(42), ID, SHA)).toMatchObject({ missing: { reason: 'read_failed', message: 'the provider threw a non-error value' } });
  });

  it(`the message is capped at ${MISSING_ASSET_MESSAGE_CAP} characters, and a message at the cap is kept whole`, async () => {
    const long = 'x'.repeat(MISSING_ASSET_MESSAGE_CAP + 400);
    const capped = await readAssetBytes(async () => Promise.reject(new Error(long)), ID, SHA);
    expect(!capped.ok && capped.missing.message).toBe('x'.repeat(MISSING_ASSET_MESSAGE_CAP));
    const exact = 'y'.repeat(MISSING_ASSET_MESSAGE_CAP);
    const kept = await readAssetBytes(async () => Promise.reject(new Error(exact)), ID, SHA);
    expect(!kept.ok && kept.missing.message).toBe(exact);
  });
});

describe('both exporters report a throwing provider and finish the export', () => {
  const state = loadFixtureState('maximal-valid');
  const throwing: AssetBytesProvider = async () => {
    throw new Error('read exploded');
  };
  const deps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-test', version: '1' }, assetBytes: throwing };

  it.each([
    ['orn.json', 'embed', buildOrnJsonExport],
    ['ornpkg', 'package', buildOrnPackageExport],
  ] as const)('%s', async (_format, assets, build) => {
    const out = await build(state, { scope: 'full', includeDependencies: false, assets }, deps);
    if (!out.ok) throw new Error(out.message);
    expect(out.result.missingAssets.length).toBeGreaterThan(0);
    for (const entry of out.result.missingAssets) expect(entry).toMatchObject({ reason: 'read_failed', message: 'read exploded' });
  });
});
