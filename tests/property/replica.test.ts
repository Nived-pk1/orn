/**
 * Step 4.2b, docs/TEST_STRATEGY.md §4 (P-07 and P-11 style) for the compute worker's replica:
 *  - after random command sequences (undo, redo and a replaceState included) the replica equals the store: state,
 *    revision, every index answer, and the findings its incremental validation maintained equal `validateAll`;
 *  - the same on the high-referrer hub shapes (ADV-012, "like water"), hub and class-hub edits, raw recipes so invalid
 *    states are reachable (the ChangeSets come from Immer patches, not from the command store);
 *  - the findings `loadReplica` answers are accepted by `replaceState` and `reload` as precomputed, with
 *    `verifyPrecomputed` on, for the states those sequences reach.
 * Every ChangeSet the replica receives has been through `structuredClone`, as it would through a worker boundary.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import type { CommitResult } from '@/core/commands';
import type { CanonicalState } from '@/core/schema';
import { frozenStateOf, intentsArb, resolveIntent, smallParamsArb, type Intent } from '@/test-support/arbitraries';
import { makeStore, testContext } from '@/test-support/command-kit';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { createReplica } from '@/workers/compute/replica';
import { expectFindingsEqualFull, expectReplicaEqualsStore, followingReplica, loadedReplica, sortedFindings } from '@/test-support/replica-kit';
import { ADV_012, EDITS, LIKE_WATER, classHubOf, hubOf, stateOf, type Ctx } from '@/test-support/scope-edits';
import { commit } from '@/test-support/state-fixture';
import { PARAMS, TIMEOUT_MS } from './harness';

// A resource limit, not an assertion: index and finding comparisons after every step of a walk (see validation-scope.test.ts).
vi.setConfig({ testTimeout: Math.max(TIMEOUT_MS, 120_000) });

const okOf = (result: CommitResult | null | undefined): boolean => result?.ok === true;

describe('P-07 replica ≡ store after random command sequences', () => {
  it('commits, undo, redo and a replaceState: state, revision, indexes and findings', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(20), (params, intents) => {
        const store = makeStore(frozenStateOf(params));
        const ctx = testContext(11);
        const { replica } = followingReplica(store);
        const other = frozenStateOf({ ...params, seed: params.seed + 1 });
        let replaced = false;
        intents.forEach((intent: Intent, i) => {
          const envelope = resolveIntent(store.getState(), intent, ctx);
          if (envelope !== undefined) store.dispatch(envelope);
          if (intent.c % 4 === 0) store.undo();
          if (intent.c % 6 === 0) store.redo();
          if (!replaced && i >= intents.length / 2 && intent.a % 2 === 0) replaced = okOf(store.replaceState(other, 'import'));
          expect(replica.revision(), `step ${i}: revision`).toBe(store.getRevision());
          expect(replica.snapshot().state, `step ${i}: state`).toEqual(store.getState());
        });
        expectReplicaEqualsStore(replica, store, 'after the sequence');
      }),
      PARAMS,
    );
  });

  it('the walk is not vacuous: undo, redo and replace are all reached', () => {
    const store = makeStore(frozenStateOf({ species: 12, classes: 3, reagents: 3, reactions: 8, relationshipsPerReaction: 0.5, topics: 2, shape: 'dense', seed: 5 }));
    const ctx = testContext(11);
    const { replica, forwarded } = followingReplica(store);
    const rename: Intent = { op: 'rename', a: 3, b: 4, c: 1 };
    for (const c of [1, 2, 3]) {
      const envelope = resolveIntent(store.getState(), { ...rename, a: c, c }, ctx);
      if (envelope !== undefined) store.dispatch(envelope);
    }
    store.undo();
    store.redo();
    store.replaceState(frozenStateOf({ species: 9, classes: 2, reagents: 2, reactions: 5, relationshipsPerReaction: 0, topics: 1, shape: 'chain', seed: 9 }), 'import');
    expect(new Set(forwarded.map((changes) => changes.cause))).toEqual(new Set(['command', 'undo', 'redo', 'replace']));
    expectReplicaEqualsStore(replica, store, 'after every cause');
  });
});

describe('P-11 the replica’s incremental findings equal validateAll on high-referrer hubs', () => {
  const editArb = fc.record({ op: fc.integer({ min: 0, max: EDITS.length - 1 }), a: fc.nat(1_000_000), b: fc.nat(1_000_000), c: fc.nat(1_000_000) });

  it.each([['ADV-012 hub', ADV_012], ['like-water hub', LIKE_WATER]] as const)('%s: after every random edit', (_name, params) => {
    const initial = stateOf(params);
    fc.assert(
      fc.property(fc.array(editArb, { minLength: 1, maxLength: 24 }), (edits) => {
        const replica = loadedReplica(initial, 0);
        const hub = hubOf(initial, replica.snapshot().indexes);
        const classHub = classHubOf(initial, replica.snapshot().indexes);
        expect(replica.snapshot().indexes.referrersOf(hub).length).toBeGreaterThan(20);
        const graveyard: Ctx['graveyard'] = [];
        let state: CanonicalState = initial;
        edits.forEach((edit, i) => {
          const recipe = EDITS[edit.op]?.({ state, indexes: replica.snapshot().indexes, hub, classHub, a: edit.a, b: edit.b, c: edit.c, graveyard });
          if (recipe === undefined) return;
          const { after, changes } = commit(state, (replica.revision() ?? 0) + 1, recipe);
          expect(replica.apply(structuredClone(changes))).toEqual({ ok: true, revision: changes.revision });
          state = after;
          expectFindingsEqualFull(replica, `edit ${i} (op ${edit.op}, ${edit.a}/${edit.b}/${edit.c})`);
        });
        expect(replica.snapshot().state).toEqual(state);
      }),
      PARAMS,
    );
  });
});

describe('the findings loadReplica answers are accepted as precomputed (Q3)', () => {
  it('replaceState and reload take them, with verifyPrecomputed on, for the states random sequences reach', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(12), (params, intents) => {
        const source = makeStore(frozenStateOf(params));
        const ctx = testContext(11);
        const states: CanonicalState[] = [source.getState()];
        for (const intent of intents) {
          const envelope = resolveIntent(source.getState(), intent, ctx);
          if (envelope !== undefined) source.dispatch(envelope);
          states.push(source.getState());
        }
        const target = states[states.length - 1] as CanonicalState;
        const base = frozenStateOf({ ...params, seed: params.seed + 7 });

        // replaceState adopts revision + 1: the worker loads the target at 4 for a writer at 3.
        const answer = createReplica().load(target, 4);
        expect(answer).toEqual(precomputedOf(target, 4));
        const writer = makeStore(base, { revision: 3, verifyPrecomputed: true });
        const adopted = writer.replaceState(target, 'import', answer);
        // The ERROR gate still runs on the precomputed findings: refused exactly as in process.
        const inProcess = makeStore(base, { revision: 3 });
        expect(adopted.ok).toBe(inProcess.replaceState(target, 'import').ok);
        if (adopted.ok) expect(sortedFindings(writer.findings.all())).toEqual(sortedFindings(inProcess.findings.all()));

        // reload adopts the revision it is given.
        const follower = makeStore(base, { revision: 3, readOnly: () => true, verifyPrecomputed: true });
        expect(follower.reload(target, 41, createReplica().load(target, 41)).ok).toBe(true);
        expect(sortedFindings(follower.findings.all())).toEqual(sortedFindings(loadedReplica(target, 41).snapshot().findings.all()));
      }),
      PARAMS,
    );
  });
});
