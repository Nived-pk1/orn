/**
 * Step 4.2e review, follow-ups a and b, through the compute worker: an asset main could not read is reported with its reason
 * (`no_bytes`, or `read_failed` with the error message, capped) exactly as the in-process export reports it, and the file's
 * generator is the one main gave (the worker keeps none of its own).
 */
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { deserializeDocument } from '@/core/dataset';
import { MISSING_ASSET_MESSAGE_CAP, type AssetBytesProvider } from '@/io';
import { withSyntheticAssets } from '@/test-support/asset-kit';
import { FORMATS, exportRig, inProcessExport } from '@/test-support/compute-export-kit';
import { TEST_GENERATOR } from '@/test-support/compute-rig';
import { loadFixtureState } from '@/test-support/state-fixture';

const base = loadFixtureState('maximal-valid');
const OPTIONS = {
  'orn.json': { scope: 'full', includeDependencies: false, assets: 'embed' },
  ornpkg: { scope: 'full', includeDependencies: false, assets: 'package' },
} as const;

describe.each(FORMATS)('missing-asset reasons through the worker (%s)', (format) => {
  const options = OPTIONS[format];

  it('no_bytes and read_failed are reported, equal to the in-process export, and the export finishes', async () => {
    const made = await withSyntheticAssets(base, { count: 4, bytesEach: 120 });
    const ids = [...made.bytes.keys()].sort();
    const long = 'z'.repeat(MISSING_ASSET_MESSAGE_CAP + 300);
    const provider: AssetBytesProvider = async (assetId) => {
      if (assetId === ids[0]) return undefined;
      if (assetId === ids[1]) throw new Error('read exploded');
      if (assetId === ids[2]) throw new Error(long);
      return made.bytes.get(assetId);
    };
    const rig = await exportRig(made.state, made.bytes);
    rig.provider = provider;
    const viaWorker = await rig.flow.export({ format, options });
    if (!viaWorker.ok) throw new Error(viaWorker.message);
    const reference = await inProcessExport(made.state, format, options, provider);
    if (!reference.ok) throw new Error(reference.message);

    const byId = new Map(viaWorker.result.missingAssets.map((entry) => [entry.assetId as string, entry]));
    expect(byId.get(ids[0] as string)).toMatchObject({ reason: 'no_bytes' });
    expect(byId.get(ids[0] as string)).not.toHaveProperty('message');
    expect(byId.get(ids[1] as string)).toMatchObject({ reason: 'read_failed', message: 'read exploded' });
    expect(byId.get(ids[2] as string)).toMatchObject({ reason: 'read_failed', message: 'z'.repeat(MISSING_ASSET_MESSAGE_CAP) });
    expect(byId.has(ids[3] as string)).toBe(false);
    expect(viaWorker.result.missingAssets).toEqual(reference.result.missingAssets);
    expect(viaWorker.result.bytes).toEqual(reference.result.bytes);
    rig.r.sync.stop();
  });

  it("the file carries the generator main gave, not one of the worker's own", async () => {
    const rig = await exportRig(base);
    const out = await rig.flow.export({ format, options: { scope: 'full', includeDependencies: false, assets: 'none' } });
    if (!out.ok) throw new Error(out.message);
    const raw = format === 'orn.json' ? out.result.bytes : unzipSync(out.result.bytes)['dataset.json'];
    if (raw === undefined) throw new Error('no dataset.json in the package');
    const parsed = deserializeDocument(new TextDecoder().decode(raw));
    if (!parsed.ok) throw new Error('exported bytes do not parse');
    expect(parsed.document.generator).toEqual(TEST_GENERATOR);
    rig.r.sync.stop();
  });
});
