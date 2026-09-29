/**
 * P-02, full pipeline (docs/TEST_STRATEGY.md §4, step 3.7): export → REAL importer (parse → conflict analysis → merged replica →
 * validation → apply through a store) → export is byte-identical (INV-19), for fixtures and generator shapes, both file
 * formats and both import modes. The in-memory half (`export-roundtrip.test.ts`) never went through the importer.
 */
import { describe, expect, it, vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import { emptyRecordTables, type CanonicalState } from '@/core/schema';
import { makeStore } from '@/test-support/command-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { exportBytes, parseBytes, testSession } from '@/test-support/import-kit';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { loadFixtureState } from '@/test-support/state-fixture';

// Resource limit, not an assertion: whole datasets are exported, parsed, validated and applied several times per case.
vi.setConfig({ testTimeout: 60_000 });

const demo = (() => {
  const result = documentToState(buildDemoDocument());
  if (!result.ok) throw new Error('demo dataset has duplicate IDs');
  return result.state;
})();

const generated = (shape: (typeof GENERATOR_SHAPES)[number], tier: 'tiny' | 'initial'): CanonicalState => {
  const result = documentToState(generateTier(tier, shape, 5));
  if (!result.ok) throw new Error('generated dataset has duplicate IDs');
  return result.state;
};

const cases: readonly (readonly [string, CanonicalState])[] = [
  ['minimal fixture', loadFixtureState('minimal-valid')],
  ['maximal fixture', loadFixtureState('maximal-valid')],
  ['demo dataset', demo],
  ...GENERATOR_SHAPES.map((shape) => [`generator ${shape} (tiny)`, generated(shape, 'tiny')] as const),
];

/** The initial tier (1,000 reactions) is exercised once, in the cheapest combination: each combination exports, parses, validates twice and applies. */
const initialTier = generated('hub_explosion', 'initial');

async function importAndExport(state: CanonicalState, format: 'json' | 'pkg', mode: 'merge' | 'replace_all'): Promise<{ first: Uint8Array; second: Uint8Array }> {
  const first = await exportBytes(state, format);
  const parsed = await parseBytes(first, format === 'json' ? 'x.orn.json' : 'x.ornpkg');
  expect(parsed.quarantined).toEqual([]);
  // Merge starts from an empty dataset with the same meta; replace_all may start from anything (here: a different meta and no records).
  const start: CanonicalState = mode === 'merge' ? { meta: state.meta, records: emptyRecordTables() } : { meta: { ...state.meta, title: 'Something else' } as never, records: emptyRecordTables() };
  const store = makeStore(start);
  const { session } = testSession(store);
  const outcome = session.preview({ parsed, fileName: 'x', request: { mode } });
  if (!outcome.ok) throw new Error(`${outcome.code}: ${outcome.message}`);
  expect(outcome.plan.preview.canConfirm).toBe(true);
  const applied = await session.apply(outcome.plan.preview.batchId, outcome.plan);
  if (!applied.ok) throw new Error(`${applied.code}: ${applied.message}`);
  return { first, second: await exportBytes(store.getState(), format) };
}

describe('P-02 full: export → import (real importer) → export is byte-identical', () => {
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

  it('generator hub_explosion (initial tier, 1,000 reactions): .json, replace_all', async () => {
    const { first, second } = await importAndExport(initialTier, 'json', 'replace_all');
    expect(second).toEqual(first);
  });

  it('a second import of the same file into the imported store is all identical_skip and changes nothing (re-import is idempotent)', async () => {
    const state = loadFixtureState('maximal-valid');
    const first = await exportBytes(state);
    const parsed = await parseBytes(first);
    const store = makeStore({ meta: state.meta, records: emptyRecordTables() });
    const { session } = testSession(store);
    const plan1 = session.preview({ parsed, fileName: 'x' });
    if (!plan1.ok) throw new Error(plan1.message);
    await session.apply(plan1.plan.preview.batchId, plan1.plan);
    const revision = store.getRevision();
    const plan2 = session.preview({ parsed, fileName: 'x' });
    if (!plan2.ok) throw new Error(plan2.message);
    expect(plan2.plan.conflicts.every((c) => c.identical && c.resolution === 'identical_skip')).toBe(true);
    await session.apply(plan2.plan.preview.batchId, plan2.plan);
    expect(await exportBytes(store.getState())).toEqual(first);
    expect(store.getRevision()).toBe(revision + 1); // one more replaceState; the content did not change
  });
});
