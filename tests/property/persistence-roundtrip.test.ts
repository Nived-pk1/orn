/**
 * P-01 (IndexedDB variant): save through the write queue → reopen → load yields a state deep-equal to the
 * original, on the schema fixtures, the demo, every generator shape, and after random command sequences
 * (docs/TEST_STRATEGY.md §4). The in-memory variant is state-document.test.ts. Runs on fake-indexeddb;
 * the seed is saved as one `replace` ChangeSet, exactly the production path (INV-20).
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { freshAdapter, loadState, reopen, seedChangeSet, type TestAdapter } from '@/test-support/persistence-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { freshStore, PARAMS, runIntents, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

/** Saves `state` into an empty database at `revision`, then reopens the database as a new page would. */
async function saveAndReload(state: CanonicalState, revision = 1): Promise<{ loaded: Awaited<ReturnType<typeof loadState>>; saved: TestAdapter }> {
  const saved = freshAdapter();
  await saved.adapter.writeChanges(seedChangeSet(state, revision), state);
  expect(saved.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: revision, pendingRevisions: 0 });
  return { loaded: await loadState(reopen(saved).adapter), saved };
}

async function expectRoundTrip(state: CanonicalState): Promise<void> {
  const { loaded } = await saveAndReload(state);
  expect(loaded.state).toEqual(state);
  expect(loaded).toMatchObject({ revision: 1, schemaVersion: 1 });
}

describe('P-01 save → load (IndexedDB variant)', () => {
  it('holds for both schema fixtures', async () => {
    for (const name of ['minimal-valid', 'maximal-valid'] as const) await expectRoundTrip(loadFixtureState(name));
  });

  it('holds for the demo dataset', async () => {
    const parsed = documentToState(buildDemoDocument());
    if (!parsed.ok) throw new Error('duplicate IDs');
    await expectRoundTrip(parsed.state);
  });

  it.each(GENERATOR_SHAPES)('holds for the tiny tier, shape %s', async (shape) => {
    const parsed = documentToState(generateTier('tiny', shape, 42));
    if (!parsed.ok) throw new Error('duplicate IDs');
    await expectRoundTrip(parsed.state);
  });

  it('holds for the initial tier (1,000 reactions), the shape with the most cross references', async () => {
    const parsed = documentToState(generateTier('initial', 'dense', 42));
    if (!parsed.ok) throw new Error('duplicate IDs');
    await expectRoundTrip(parsed.state);
  }, 60_000);

  it('holds for small generated datasets of every shape', async () => {
    await fc.assert(fc.asyncProperty(smallParamsArb, async (params) => expectRoundTrip(frozenStateOf(params))), PARAMS);
  });

  it('holds after random command sequences saved as they are committed (same-tick commits coalesce)', async () => {
    await fc.assert(
      fc.asyncProperty(smallParamsArb, intentsArb(25), async (params, intents) => {
        const { store, ctx } = freshStore(frozenStateOf(params));
        const t = freshAdapter();
        await t.adapter.writeChanges(seedChangeSet(store.getState(), store.getRevision()), store.getState());
        store.subscribe((changes) => void t.adapter.writeChanges(changes, store.getState()));
        runIntents(store, intents, ctx);
        await t.adapter.flush();
        expect(t.adapter.getStatus()).toEqual({ state: 'saved', lastSavedRevision: store.getRevision(), pendingRevisions: 0 });
        const loaded = await loadState(reopen(t).adapter);
        expect(loaded.state).toEqual(store.getState());
        expect(loaded.revision).toBe(store.getRevision());
      }),
      PARAMS,
    );
  });

  it('holds after random command sequences with each ChangeSet saved on its own, and after undo and redo', async () => {
    await fc.assert(
      fc.asyncProperty(smallParamsArb, intentsArb(20), async (params, intents) => {
        const initial = frozenStateOf(params);
        const { store, ctx } = freshStore(initial);
        let t = freshAdapter();
        await t.adapter.writeChanges(seedChangeSet(initial, store.getRevision()), initial);
        store.subscribe((changes) => void t.adapter.writeChanges(changes, store.getState()));
        const check = async (expected: CanonicalState): Promise<void> => {
          await t.adapter.flush();
          expect(t.adapter.getStatus()).toMatchObject({ state: 'saved', pendingRevisions: 0, lastSavedRevision: store.getRevision() });
          t = reopen(t, { initialRevision: store.getRevision() });
          const loaded = await loadState(t.adapter);
          expect(loaded.state).toEqual(expected);
          expect(loaded.revision).toBe(store.getRevision());
        };
        for (const intent of intents) {
          runIntents(store, [intent], ctx);
          await t.adapter.flush();
        }
        const final = store.getState();
        await check(final);
        while (store.canUndo()) store.undo();
        await check(initial);
        while (store.canRedo()) store.redo();
        await check(final);
      }),
      { ...PARAMS, numRuns: Math.max(5, Math.floor(PARAMS.numRuns / 2)) },
    );
  });
});
