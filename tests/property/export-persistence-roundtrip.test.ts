/**
 * P-02, persistence part (docs/TEST_STRATEGY.md §4, docs/IMPLEMENTATION_PLAN.md §2 step 3.5): save → load
 * (fake-indexeddb, P-01's own round trip) → export equals export of the original state. `export-roundtrip.test.ts`
 * (Phase 1) already covers the in-memory half of P-02 (export → import → export); the full pipeline through the
 * real importer needs steps 3.6-3.7 and is not testable yet.
 */
import { describe, expect, it, vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { buildOrnJsonExport, buildOrnPackageExport, type OrnJsonExportDeps } from '@/io';
import { buildDemoDocument } from '@/test-support/demo';
import { freshAdapter, loadState, seedChangeSet } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

// Resource limit, not an assertion: this file builds large datasets and loses its 5 s default under workstation contention (docs/PROGRESS.md, step 3.6 review).
vi.setConfig({ testTimeout: 30_000 });

const deps: OrnJsonExportDeps = { exportedAt: '2026-09-29T00:00:00.000Z', generator: { app: 'orn-test', version: '1' }, assetBytes: async () => undefined };

async function savedAndReloaded(state: CanonicalState): Promise<CanonicalState> {
  const t = freshAdapter({ initialRevision: 0 });
  await t.adapter.writeChanges(seedChangeSet(state, 1), state);
  return (await loadState(t.adapter)).state;
}

const demo = (() => {
  const result = documentToState(buildDemoDocument());
  if (!result.ok) throw new Error('demo dataset has duplicate IDs');
  return result.state;
})();

describe.each([
  ['demo dataset', demo],
  ['maximal schema fixture', loadFixtureState('maximal-valid')],
])('save -> load -> export equals export of the original, %s', (_name, state) => {
  it.each([
    ['full', 'none'],
    ['chemistry', 'none'],
  ] as const)('.orn.json, scope %s, assets %s', async (scope, assets) => {
    const reloaded = await savedAndReloaded(state);
    const options = { scope, includeDependencies: false, assets } as const;
    const original = await buildOrnJsonExport(state, options, deps);
    const after = await buildOrnJsonExport(reloaded, options, deps);
    if (!original.ok || !after.ok) throw new Error('export failed');
    expect(after.result.bytes).toEqual(original.result.bytes);
  });

  it('.ornpkg, scope full', async () => {
    const reloaded = await savedAndReloaded(state);
    const options = { scope: 'full', includeDependencies: false, assets: 'none' } as const;
    const original = await buildOrnPackageExport(state, options, deps);
    const after = await buildOrnPackageExport(reloaded, options, deps);
    if (!original.ok || !after.ok) throw new Error('export failed');
    expect(after.result.bytes).toEqual(original.result.bytes);
  });
});
