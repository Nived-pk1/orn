/** P-02: export → import → export is byte-identical (INV-19), on generated data and after random edits. */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { deserializeDocument, documentToState, stateToDocument } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import { loadFixtureState } from '@/test-support/state-fixture';
import { bytesOf, freshStore, PARAMS, runIntents, TIMEOUT_MS } from './harness';

const OPTIONS = { exportedAt: '2026-09-21T00:00:00.000Z', exportScope: 'full', generator: { app: 'property', version: '0' } } as const;

function roundTrip(state: CanonicalState): { first: string; second: string } {
  const first = bytesOf(state);
  const parsed = deserializeDocument(first);
  if (!parsed.ok) throw new Error(`export did not re-import: ${JSON.stringify(parsed.issues.slice(0, 3))}`);
  const imported = documentToState(parsed.document);
  if (!imported.ok) throw new Error('re-import found duplicate IDs');
  expect(imported.state).toEqual(state);
  const second = bytesOf(imported.state);
  expect(stateToDocument(imported.state, OPTIONS)).toEqual(stateToDocument(state, OPTIONS));
  return { first, second };
}

vi.setConfig({ testTimeout: TIMEOUT_MS });

describe('P-02 export → import → export', () => {
  it('holds for both schema fixtures', () => {
    for (const name of ['minimal-valid', 'maximal-valid'] as const) {
      const { first, second } = roundTrip(loadFixtureState(name));
      expect(second).toBe(first);
    }
  });

  it('holds for generated datasets of every shape', () => {
    fc.assert(
      fc.property(smallParamsArb, (params) => {
        const { first, second } = roundTrip(frozenStateOf(params));
        expect(second).toBe(first);
      }),
      PARAMS,
    );
  });

  it('holds after random command sequences', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(25), (params, intents) => {
        const { store, ctx } = freshStore(frozenStateOf(params));
        runIntents(store, intents, ctx);
        const { first, second } = roundTrip(store.getState());
        expect(second).toBe(first);
      }),
      PARAMS,
    );
  });
});
