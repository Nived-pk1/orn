/**
 * Step 4.2e: export in the compute worker over the in-memory rig (real handlers, real replica sync, every message cloned with
 * `structuredClone`). INV-19: the file the worker builds is byte-identical to the in-process export of the same state, options,
 * clock and generator, for both formats and every scope, over the fixtures, the demo and the generator shapes. Plan contents,
 * missing bytes and missing references are reported, never thrown. The failure paths are in compute-export-failures.test.ts and
 * the real thread in compute-export-threads.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { CanonicalState, RecordRef } from '@/core/schema';
import type { ExportOptions } from '@/io';
import { withSyntheticAssets } from '@/test-support/asset-kit';
import { FORMATS, exportRig, inProcessExport } from '@/test-support/compute-export-kit';
import { TEST_GENERATOR } from '@/test-support/compute-rig';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { ExportFormat } from '@/workers/rpc/contracts';

// Resource limit, not an assertion: every case builds a rig and exports about ten times, twice (worker and in process).
vi.setConfig({ testTimeout: 60_000 });

const demo = (() => {
  const result = documentToState(buildDemoDocument());
  if (!result.ok) throw new Error('demo dataset has duplicate IDs');
  return result.state;
})();
const generated = (shape: (typeof GENERATOR_SHAPES)[number]): CanonicalState => {
  const result = documentToState(generateTier('tiny', shape, 5));
  if (!result.ok) throw new Error('generated dataset has duplicate IDs');
  return result.state;
};

const firstOf = (state: CanonicalState, kind: RecordRef['kind']): RecordRef => ({ kind, id: Object.keys(state.records[kind]).sort()[0] as string });
/** A subset of whatever the state has: its first reaction and its first species (references leave the set unless closure is on). */
const subsetOf = (state: CanonicalState): readonly RecordRef[] => [firstOf(state, 'reaction'), firstOf(state, 'species')].filter((ref) => ref.id !== undefined);

function optionsFor(state: CanonicalState, assets: ExportOptions['assets']): readonly ExportOptions[] {
  return [
    { scope: 'full', includeDependencies: false, assets },
    { scope: 'chemistry', includeDependencies: false, assets },
    { scope: 'curriculum', includeDependencies: false, assets },
    { scope: 'presentation', includeDependencies: false, assets },
    { scope: 'subset', subset: subsetOf(state), includeDependencies: true, assets },
    { scope: 'subset', subset: subsetOf(state), includeDependencies: false, assets },
  ];
}

/** The maximal fixture plus synthetic assets attached to a species, a reaction, a topic and a view preset (one attached to nothing). */
async function withAssets(): Promise<{ readonly state: CanonicalState; readonly bytes: ReadonlyMap<string, Uint8Array> }> {
  const base = loadFixtureState('maximal-valid');
  const targets = [firstOf(base, 'species'), firstOf(base, 'reaction'), firstOf(base, 'topic'), firstOf(base, 'view_preset'), undefined];
  const made = await withSyntheticAssets(base, { count: 5, bytesEach: 300, attachTo: (i) => targets[i] });
  // The fixture's own asset has bytes too, except one synthetic asset (its bytes are "not in the store").
  const bytes = new Map(made.bytes);
  bytes.set('ast_max-grignard-scheme', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]));
  bytes.delete('ast_syn-00004');
  return { state: made.state, bytes };
}

const noAssetCases: readonly (readonly [string, CanonicalState])[] = [
  ['minimal fixture', loadFixtureState('minimal-valid')],
  ['demo dataset', demo],
  ...GENERATOR_SHAPES.map((shape) => [`generator ${shape} (tiny)`, generated(shape)] as const),
];

const formatsAndAssets = FORMATS.flatMap((format) => (['none', 'embed', 'package'] as const).map((assets) => [format, assets] as const));

describe('INV-19 through the worker: byte-identical to the in-process export', () => {
  describe.each(noAssetCases)('%s', (_name, state) => {
    it.each(FORMATS)('%s, every scope', async (format) => {
      const rig = await exportRig(state);
      for (const options of optionsFor(state, 'none')) {
        const reference = await inProcessExport(state, format, options);
        const exported = await rig.flow.export({ format, options });
        if (!reference.ok || !exported.ok) throw new Error(`export failed for ${options.scope}`);
        expect(exported.result.bytes, `${options.scope} includeDependencies=${String(options.includeDependencies)}`).toEqual(reference.result.bytes);
        expect(exported.result.counts).toEqual(reference.result.counts);
        expect(exported.result.missingReferences).toEqual(reference.result.missingReferences);
        expect(exported.revision).toBe(1);
      }
      rig.r.sync.stop();
    });
  });

  describe('with assets (fixture asset and synthetic ones, one without bytes)', () => {
    it.each(formatsAndAssets)('%s, assets %s, every scope', async (format, assets) => {
      const { state, bytes } = await withAssets();
      const rig = await exportRig(state, bytes);
      for (const options of optionsFor(state, assets)) {
        const reference = await inProcessExport(state, format, options, async (id) => bytes.get(id));
        const exported = await rig.flow.export({ format, options });
        if (!reference.ok || !exported.ok) throw new Error(`export failed for ${options.scope}`);
        expect(exported.result.bytes, `${options.scope} includeDependencies=${String(options.includeDependencies)}`).toEqual(reference.result.bytes);
        expect(exported.result.missingAssets).toEqual(reference.result.missingAssets);
        expect(exported.result.missingReferences).toEqual(reference.result.missingReferences);
      }
      rig.r.sync.stop();
    });
  });
});

describe('the plan asks main for exactly the bytes the export uses', () => {
  const wants = (format: ExportFormat, assets: ExportOptions['assets']): boolean => (format === 'orn.json' ? assets === 'embed' : assets !== 'none');

  it.each(formatsAndAssets)('%s, assets %s: main reads the full scope\'s assets in ID order, and nothing when the format reads none', async (format, assets) => {
    const { state, bytes } = await withAssets();
    const rig = await exportRig(state, bytes);
    const exported = await rig.flow.export({ format, options: { scope: 'full', includeDependencies: false, assets } });
    expect(exported.ok).toBe(true);
    expect(rig.asked).toEqual(wants(format, assets) ? Object.keys(state.records.asset).sort() : []);
    rig.r.sync.stop();
  });

  it('a subset without closure asks for no asset it does not include; a chemistry export asks for those attached to what it includes', async () => {
    const { state, bytes } = await withAssets();
    const rig = await exportRig(state, bytes);
    const species = firstOf(state, 'species');
    await rig.flow.export({ format: 'ornpkg', options: { scope: 'subset', subset: [species], includeDependencies: false, assets: 'package' } });
    expect(rig.asked).toEqual([]);
    const chemistry = await rig.flow.export({ format: 'ornpkg', options: { scope: 'chemistry', includeDependencies: false, assets: 'package' } });
    expect(chemistry.ok).toBe(true);
    const chemical = (id: string): boolean => (state.records.asset[id as never] as { attachedTo: { ref: RecordRef }[] }).attachedTo.some((a) => ['species', 'reaction'].includes(a.ref.kind));
    expect(rig.asked).toEqual(Object.keys(state.records.asset).sort().filter(chemical));
    expect(rig.asked.length).toBeGreaterThan(0);
    expect(rig.asked.length).toBeLessThan(Object.keys(state.records.asset).length);
    rig.r.sync.stop();
  });
});

describe('gaps are reported, never thrown', () => {
  it('an asset with no bytes is in missingAssets (main leaves it out of the request) and the rest is exported', async () => {
    const { state, bytes } = await withAssets();
    const rig = await exportRig(state, bytes);
    const exported = await rig.flow.export({ format: 'ornpkg', options: { scope: 'full', includeDependencies: false, assets: 'package' } });
    if (!exported.ok) throw new Error(exported.message);
    expect(exported.result.missingAssets.map((m) => m.assetId)).toEqual(['ast_syn-00004']);
    expect(exported.result.counts.asset).toBe(6);
    rig.r.sync.stop();
  });

  it('a provider that throws counts as no bytes for that asset', async () => {
    const { state, bytes } = await withAssets();
    const rig = await exportRig(state, bytes);
    rig.provider = async (id) => {
      if (id === 'ast_syn-00001') throw new Error('the blob store failed');
      return bytes.get(id);
    };
    const exported = await rig.flow.export({ format: 'orn.json', options: { scope: 'full', includeDependencies: false, assets: 'embed' } });
    if (!exported.ok) throw new Error(exported.message);
    expect(exported.result.missingAssets.map((m) => m.assetId).sort()).toEqual(['ast_syn-00001', 'ast_syn-00004']);
    rig.r.sync.stop();
  });

  it('a subset without closure reports every reference that leaves it (missingReferences), as the in-process export does', async () => {
    const rig = await exportRig(demo);
    const options: ExportOptions = { scope: 'subset', subset: [firstOf(demo, 'reaction')], includeDependencies: false, assets: 'none' };
    const reference = await inProcessExport(demo, 'orn.json', options);
    const exported = await rig.flow.export({ format: 'orn.json', options });
    if (!reference.ok || !exported.ok) throw new Error('export failed');
    expect(exported.result.missingReferences.length).toBeGreaterThan(0);
    expect(exported.result.missingReferences).toEqual(reference.result.missingReferences);
    rig.r.sync.stop();
  });
});

describe('what crosses the worker boundary', () => {
  it('every parameter and result of exportPlan and exportBuild passes structuredClone unchanged', async () => {
    const { state, bytes } = await withAssets();
    const rig = await exportRig(state, bytes);
    const client = rig.r.sync.client;
    const params = { options: { scope: 'full', includeDependencies: false, assets: 'package' } as const, format: 'ornpkg' as const, revision: 1 };
    expect(structuredClone(params)).toEqual(params);
    const plan = await client.exportPlan(params);
    if (!plan.ok || !plan.value.ok) throw new Error('plan failed');
    expect(structuredClone(plan.value)).toEqual(plan.value);
    const buildParams = { ...params, assets: plan.value.assets.map((a) => ({ ...a, bytes: bytes.get(a.assetId) ?? new Uint8Array([1]) })), exportedAt: '2026-09-30T12:00:00.000Z', generator: TEST_GENERATOR };
    expect(structuredClone(buildParams)).toEqual(buildParams);
    const build = await client.exportBuild(buildParams);
    if (!build.ok || !build.value.ok) throw new Error('build failed');
    expect(structuredClone(build.value)).toEqual(build.value);
    rig.r.sync.stop();
  });

  it('the result bytes are a plain Uint8Array a Blob can wrap (Blob is not in the contract), and a buffer the provider keeps is not detached', async () => {
    const { state, bytes } = await withAssets();
    const rig = await exportRig(state, bytes);
    const kept = bytes.get('ast_syn-00000') as Uint8Array;
    const exported = await rig.flow.export({ format: 'ornpkg', options: { scope: 'full', includeDependencies: false, assets: 'package' } });
    if (!exported.ok) throw new Error(exported.message);
    expect(exported.result.bytes).toBeInstanceOf(Uint8Array);
    expect(new Blob([exported.result.bytes as BlobPart]).size).toBe(exported.result.bytes.length);
    expect(kept.byteLength).toBe(300);
    expect(kept.buffer.byteLength).toBe(300);
    rig.r.sync.stop();
  });

  it('the worker is asked twice per export (plan, build) and the state is never sent again', async () => {
    const rig = await exportRig(demo);
    rig.r.calls.length = 0;
    await rig.flow.export({ format: 'orn.json', options: { scope: 'full', includeDependencies: false, assets: 'none' } });
    expect(rig.r.calls.map((c) => c.method)).toEqual(['exportPlan', 'exportBuild']);
    rig.r.sync.stop();
  });
});
