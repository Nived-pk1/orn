/**
 * P-01 (in-memory variant): state → document → state is deep-equal, on generated data and after random
 * command sequences. The IndexedDB variant (save → load with fake-indexeddb) belongs to step 3.5.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { documentToState, stateToDocument } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import { loadFixtureState } from '@/test-support/state-fixture';
import { freshStore, PARAMS, runIntents, TIMEOUT_MS } from './harness';

const OPTIONS = { exportedAt: '2026-09-21T00:00:00.000Z', exportScope: 'full', generator: { app: 'property', version: '0' } } as const;

function expectRoundTrip(state: CanonicalState): void {
  const back = documentToState(stateToDocument(state, OPTIONS));
  if (!back.ok) throw new Error('document has duplicate IDs');
  expect(back.state).toEqual(state);
}

vi.setConfig({ testTimeout: TIMEOUT_MS });

describe('P-01 state → document → state (in-memory variant)', () => {
  it('holds for both schema fixtures', () => {
    for (const name of ['minimal-valid', 'maximal-valid'] as const) expectRoundTrip(loadFixtureState(name));
  });

  it('holds for generated datasets of every shape', () => {
    fc.assert(fc.property(smallParamsArb, (params) => expectRoundTrip(frozenStateOf(params))), PARAMS);
  });

  it('holds after random command sequences', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(25), (params, intents) => {
        const { store, ctx } = freshStore(frozenStateOf(params));
        runIntents(store, intents, ctx);
        expectRoundTrip(store.getState());
      }),
      PARAMS,
    );
  });
});
