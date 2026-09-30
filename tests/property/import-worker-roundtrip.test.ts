/**
 * P-02 full through the compute worker, entirely (steps 4.2c and 4.2e): export in the worker (plan, then build) -> the REAL importer
 * running in the worker (parse -> conflict analysis -> merged replica -> validation -> prepare -> snapshot bytes -> ONE replaceState with the
 * worker's findings) -> export in the worker is byte-identical (INV-19), for fixtures and generator shapes, both file formats and both modes.
 * The in-process twin is import-export-roundtrip.test.ts; the initial tier stays there (and in the import bench).
 */
import { describe, expect, it, vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { planOf, workerDriver, workerImportRig } from '@/test-support/compute-import-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { TEST_GENERATOR } from '@/test-support/compute-rig';
import { EXPORTED_AT, exportRig } from '@/test-support/compute-export-kit';
import { createComputeExport, type ComputeExportRequest } from '@/workers/compute/export-main';
import { expectReplicaEqualsStore } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

// Resource limit, not an assertion: each case exports, parses, validates (twice: preview and prepare) and applies through a worker.
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

const cases: readonly (readonly [string, CanonicalState])[] = [
  ['minimal fixture', loadFixtureState('minimal-valid')],
  ['maximal fixture', loadFixtureState('maximal-valid')],
  ['demo dataset', demo],
  ...GENERATOR_SHAPES.map((shape) => [`generator ${shape} (tiny)`, generated(shape)] as const),
];

const FULL = { scope: 'full', includeDependencies: false, assets: 'none' } as const;

/** The whole export through the worker's two calls: any failure is a test failure. */
async function workerExport(flow: ReturnType<typeof createComputeExport>, format: ComputeExportRequest['format']): Promise<Uint8Array> {
  const exported = await flow.export({ format, options: FULL });
  if (!exported.ok) throw new Error(`${exported.code}: ${exported.message}`);
  return exported.result.bytes;
}

async function importAndExport(state: CanonicalState, format: 'json' | 'pkg', mode: 'merge' | 'replace_all'): Promise<{ first: Uint8Array; second: Uint8Array }> {
  const wire = format === 'json' ? 'orn.json' : 'ornpkg';
  const source = await exportRig(state);
  const first = await workerExport(source.flow, wire);
  source.r.sync.stop();
  const start: CanonicalState = mode === 'merge' ? { meta: state.meta, records: emptyRecordTables() } : { meta: { ...state.meta, title: 'Something else' } as never, records: emptyRecordTables() };
  const rig = await workerImportRig(start);
  const driver = workerDriver(rig);
  const plan = planOf(await driver.preview(first, format === 'json' ? 'x.orn.json' : 'x.ornpkg', { mode }));
  expect(plan.preview.canConfirm).toBe(true);
  expect(plan.preview.quarantined).toEqual([]);
  const applied = await driver.apply(plan.preview.batchId, plan);
  if (!applied.ok) throw new Error(`${applied.code}: ${applied.message}`);
  await rig.r.sync.settled();
  expectReplicaEqualsStore(rig.r.replicas[rig.r.replicas.length - 1] as NonNullable<(typeof rig.r.replicas)[number]>, rig.store, 'replica after the import');
  const second = await workerExport(createComputeExport({ sync: rig.r.sync, store: rig.store, assetBytes: async () => undefined, ids: { now: () => EXPORTED_AT }, generator: TEST_GENERATOR }), wire);
  rig.r.sync.stop();
  return { first, second };
}

describe('P-02 full through the worker (INV-19): export -> import -> export is byte-identical', () => {
  describe.each(cases)('%s', (_name, state) => {
    it.each([
      ['json', 'replace_all'],
      ['json', 'merge'],
      ['pkg', 'replace_all'],
    ] as const)('.%s, %s', async (format, mode) => {
      const { first, second } = await importAndExport(state, format, mode);
      expect(second).toEqual(first);
    });
  });
});
