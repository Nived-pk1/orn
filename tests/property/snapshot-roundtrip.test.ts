/**
 * Snapshot round trip (step 3.2, docs/TEST_STRATEGY.md §4 spirit of P-01): state → snapshot bytes → decoded document
 * → strict parse → state is deep-equal, on the schema fixtures, the demo, every generator shape, random datasets and
 * after random command sequences. The build is deterministic. Pure: no IndexedDB (the stored path is covered in
 * tests/integration/persistence-snapshots.test.ts).
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { documentToState } from '@/core/dataset';
import { DatasetDocumentSchema, type CanonicalState } from '@/core/schema';
import { buildSnapshot, decodeSnapshot } from '@/persistence/snapshot-codec';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { loadFixtureState } from '@/test-support/state-fixture';
import { freshStore, PARAMS, runIntents, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

function roundTrip(state: CanonicalState, revision = 3): void {
  const input = { id: 'snp_x', createdAt: '2026-09-28T10:00:00.000Z', reason: 'manual', state, revision, generator: { app: 'property', version: '0' } } as const;
  const built = buildSnapshot(input);
  const again = buildSnapshot(input);
  if (!built.ok || !again.ok) throw new Error(`snapshot build failed: ${JSON.stringify(built.ok ? [] : built.issues.slice(0, 3))}`);
  expect(Array.from(again.built.bytes)).toEqual(Array.from(built.built.bytes));
  const decoded = decodeSnapshot(built.built.bytes);
  if (!decoded.ok) throw new Error(decoded.message);
  const back = documentToState(DatasetDocumentSchema.parse(decoded.doc));
  if (!back.ok) throw new Error('duplicate IDs');
  expect(back.state).toEqual(state);
  expect(built.built.summary).toMatchObject({ revision, byteSize: built.built.bytes.length });
}

describe('snapshot round trip', () => {
  it('holds for both schema fixtures and the demo', () => {
    for (const name of ['minimal-valid', 'maximal-valid'] as const) roundTrip(loadFixtureState(name));
    const demo = documentToState(buildDemoDocument());
    if (!demo.ok) throw new Error('duplicate IDs');
    roundTrip(demo.state);
  });

  it.each(GENERATOR_SHAPES)('holds for the tiny tier, shape %s', (shape) => {
    const parsed = documentToState(generateTier('tiny', shape, 42));
    if (!parsed.ok) throw new Error('duplicate IDs');
    roundTrip(parsed.state);
  });

  it('holds for the initial tier (1,000 reactions)', () => {
    const parsed = documentToState(generateTier('initial', 'dense', 42));
    if (!parsed.ok) throw new Error('duplicate IDs');
    roundTrip(parsed.state);
  }, 60_000);

  it('holds for small generated datasets of every shape', () => {
    fc.assert(fc.property(smallParamsArb, (params) => roundTrip(frozenStateOf(params))), PARAMS);
  });

  it('holds after random command sequences', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(25), (params, intents) => {
        const { store, ctx } = freshStore(frozenStateOf(params));
        runIntents(store, intents, ctx);
        roundTrip(store.getState(), store.getRevision());
      }),
      PARAMS,
    );
  });
});
