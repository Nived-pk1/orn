/**
 * Step 4.2a, Phase 4 contract decisions Q3 (property): for the fixtures, the demo, every generator shape at the initial
 * tier and states reached by random command sequences, `replaceState` and `reload` with precomputed = `validateAll` leave
 * the store exactly where the in-process path leaves it: same state, revision, finding store, ChangeSet and history.
 * `verifyPrecomputed` is ON for the precomputed stores, so a difference from `validateAll` would be refused, not hidden.
 * docs/TEST_STRATEGY.md §4.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { CommitResult } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import { makeStore } from '@/test-support/command-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { GENERATOR_SHAPES, generateTier } from '@/test-support/generator';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { freshStore, PARAMS, runIntents, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: Math.max(TIMEOUT_MS, 120_000) });

const BASE = loadFixtureState('minimal-valid');
const START = 3;
const RELOADED = 41;

const sameResult = (a: CommitResult, b: CommitResult): void => {
  expect(a.ok).toBe(true);
  expect(b).toEqual(a);
};

/** The in-process path and the precomputed path adopt `target` the same way, by replaceState and by reload. */
function expectSameAdoption(target: CanonicalState): void {
  const plain = makeStore(BASE, { revision: START });
  const fast = makeStore(BASE, { revision: START, verifyPrecomputed: true });
  sameResult(plain.replaceState(target, 'import'), fast.replaceState(target, 'import', precomputedOf(target, START + 1)));
  expect(fast.getState()).toBe(target);
  expect(fast.getRevision()).toBe(plain.getRevision());
  expect(fast.getIndexes().revision).toBe(fast.getRevision());
  expect(fast.findings.all()).toEqual(plain.findings.all());
  expect(fast.findings.counts()).toEqual(plain.findings.counts());
  expect(fast.historyLabels()).toEqual(plain.historyLabels());

  const plainFollower = makeStore(BASE, { revision: START, readOnly: () => true });
  const fastFollower = makeStore(BASE, { revision: START, readOnly: () => true, verifyPrecomputed: true });
  sameResult(plainFollower.reload(target, RELOADED), fastFollower.reload(target, RELOADED, precomputedOf(target, RELOADED)));
  expect(fastFollower.getRevision()).toBe(RELOADED);
  expect(fastFollower.findings.all()).toEqual(plainFollower.findings.all());
}

describe('precomputed findings ≡ the in-process path (Q3)', () => {
  it('the schema fixtures', () => {
    expectSameAdoption(BASE);
    expectSameAdoption(loadFixtureState('maximal-valid'));
  });

  it('the demo dataset (with its planted warning)', () => {
    const parsed = documentToState(buildDemoDocument());
    if (!parsed.ok) throw new Error('demo has duplicate IDs');
    expectSameAdoption(parsed.state);
  });

  it.each(GENERATOR_SHAPES)('the initial tier, shape %s', (shape) => {
    const parsed = documentToState(generateTier('initial', shape, 42));
    if (!parsed.ok) throw new Error('generator produced duplicate IDs');
    expectSameAdoption(parsed.state);
  });

  it('states reached by random command sequences (undo and redo included)', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(20), (params, intents) => {
        const { store, ctx } = freshStore(frozenStateOf(params));
        const steps = runIntents(store, intents, ctx);
        const middle = steps[Math.floor(steps.length / 2)]?.after;
        if (middle !== undefined) expectSameAdoption(middle);
        expectSameAdoption(store.getState());
      }),
      PARAMS,
    );
  });
});
