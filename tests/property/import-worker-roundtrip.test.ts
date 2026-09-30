/**
 * P-02 full through the compute worker (step 4.2c): export (in process until step 4.2e) -> the REAL importer running in the
 * worker (parse -> conflict analysis -> merged replica -> validation -> prepare -> snapshot bytes -> ONE replaceState with the
 * worker's findings) -> export is byte-identical (INV-19), for fixtures and generator shapes, both file formats and both modes.
 * The in-process twin is import-export-roundtrip.test.ts; the initial tier stays there (and in the import bench).
 */
import { describe, expect, it, vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { planOf, workerDriver, workerImportRig } from '@/test-support/compute-import-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { exportBytes } from '@/test-support/import-kit';
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

async function importAndExport(state: CanonicalState, format: 'json' | 'pkg', mode: 'merge' | 'replace_all'): Promise<{ first: Uint8Array; second: Uint8Array }> {
  const first = await exportBytes(state, format);
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
  return { first, second: await exportBytes(rig.store.getState(), format) };
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
