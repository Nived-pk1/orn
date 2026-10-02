/**
 * P-07 for the app's DerivedIndexes service (step 5.1a, Phase 5 decision Q1 option B; docs/TEST_STRATEGY.md §4): after random
 * command sequences with undo, redo, rejected commits, reads at random points and a replaceState, and on a follower after
 * applyRemote spans and reloads, every answer of `current()` equals `indexEngine.build` of the store's state (INV-18). Also: a
 * rejected commit causes no build and no apply, and a store whose ChangeSets were never read costs nothing until the read.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createDerivedIndexes, type DerivedIndexes } from '@/app/services';
import { createCanonicalStore, type RemoteChange, type StoreHandle } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import { indexEngine } from '@/core/indexes';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { frozenStateOf, intentArb, resolveIntent, smallParamsArb } from '@/test-support/arbitraries';
import { derivedSnapshot, idsOf } from '@/test-support/index-snapshot';
import { freshStore, PARAMS, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const clock = (): { nowMs(): number } => {
  let ms = 0;
  return { nowMs: () => (ms += 1) };
};

/** Every answer of `derived.current()` against a fresh build of the store's state, over every ID seen so far. */
function expectEqualsBuild(derived: DerivedIndexes, store: StoreHandle, universe: Set<string>, label: string): void {
  const state = store.getState();
  for (const id of idsOf(state)) universe.add(id);
  const live = derived.current();
  expect(live.revision, `${label}: revision`).toBe(store.getRevision());
  // The service's own safety net (a read from a listener that ran before its own) must never be what makes the answer right here.
  expect(derived.stats().lastBuildReason, label).not.toBe('mismatch');
  expect(derivedSnapshot(live, universe), label).toEqual(derivedSnapshot(indexEngine.build(state, store.getRevision()), universe));
}

const opArb = fc.record({ op: fc.constantFrom('intent', 'intent', 'intent', 'undo', 'redo', 'read', 'read', 'replace'), intent: intentArb });

let rejected = 0;
let applied = 0;
let replaced = 0;

describe('P-07 DerivedIndexes: current() equals indexEngine.build', () => {
  it('after random commands, undo, redo, rejected commits, reads at random points and a replaceState', () => {
    fc.assert(
      fc.property(smallParamsArb, fc.array(opArb, { minLength: 1, maxLength: 22 }), (params, ops) => {
        const initial = frozenStateOf(params);
        const { store, ctx } = freshStore(initial);
        const derived = createDerivedIndexes({ store, clock: clock() });
        const universe = new Set<string>();
        expect(derived.stats().builds).toBe(0); // lazy
        for (const [i, step] of ops.entries()) {
          const before = derived.stats();
          if (step.op === 'intent') {
            const envelope = resolveIntent(store.getState(), step.intent, ctx);
            const result = envelope === undefined ? undefined : store.dispatch(envelope);
            if (result !== undefined && !result.ok) {
              rejected += 1;
              // A rejected commit is never announced: no build, no apply, nothing queued.
              expect(derived.stats()).toEqual(before);
            }
          } else if (step.op === 'undo') {
            store.undo();
          } else if (step.op === 'redo') {
            store.redo();
          } else if (step.op === 'replace') {
            const next = frozenStateOf({ ...params, seed: params.seed + 1 + i });
            const result = store.replaceState(next, 'import');
            if (result.ok) replaced += 1;
          } else {
            expectEqualsBuild(derived, store, universe, `read after step ${i}`);
          }
          const after = derived.stats();
          applied = Math.max(applied, after.applies);
        }
        expectEqualsBuild(derived, store, universe, 'final read');
        // Reading twice with no commit in between reuses the handle: nothing is built or applied again.
        const settled = derived.stats();
        derived.current();
        expect(derived.stats().builds).toBe(settled.builds);
        expect(derived.stats().applies).toBe(settled.applies);
      }),
      PARAMS,
    );
    expect(rejected).toBeGreaterThan(0); // the model does produce rejected commits
    expect(applied).toBeGreaterThan(0); // and the queue path (not only rebuilds) is exercised
    expect(replaced).toBeGreaterThan(0);
  });
});

const recordOf = (state: CanonicalState, id: string): AnyRecord | undefined =>
  Object.values(state.records).map((table) => (table as Readonly<Record<string, AnyRecord>>)[id]).find((record) => record !== undefined);

function remoteChange(fromRevision: number, writer: StoreHandle, changes: readonly ChangeSet[]): RemoteChange {
  const ids = new Set<string>();
  for (const change of changes) for (const ref of [...change.created, ...change.updated, ...change.deleted]) ids.add(ref.id);
  const upserts: AnyRecord[] = [];
  const deletedIds: string[] = [];
  for (const id of [...ids].sort()) {
    const record = recordOf(writer.getState(), id);
    if (record === undefined) deletedIds.push(id);
    else upserts.push(record);
  }
  return { fromRevision, revision: writer.getRevision(), upserts, deletedIds, meta: writer.getState().meta };
}

describe('P-07 DerivedIndexes on a follower: after applyRemote spans, reloads and a boot from the stored state', () => {
  it('current() equals indexEngine.build after every span and reload', () => {
    fc.assert(
      fc.property(smallParamsArb, fc.array(fc.record({ intent: intentArb, then: fc.constantFrom('span', 'reload', 'skip', 'read') }), { minLength: 1, maxLength: 18 }), (params, plan) => {
        const initial = frozenStateOf(params);
        const { store: writer, ctx } = freshStore(initial);
        const follower = createCanonicalStore({ initial, readOnly: () => true });
        const derived = createDerivedIndexes({ store: follower, clock: clock() });
        const pending: ChangeSet[] = [];
        writer.subscribe((changes) => pending.push(changes));
        const universe = new Set<string>();
        let synced = 0;
        for (const [i, step] of plan.entries()) {
          const envelope = resolveIntent(writer.getState(), step.intent, ctx);
          if (envelope !== undefined) writer.dispatch(envelope);
          if (step.then === 'read') {
            expectEqualsBuild(derived, follower, universe, `follower read ${i}`);
            continue;
          }
          if (pending.length === 0 || step.then === 'skip') continue;
          const result = step.then === 'reload' ? follower.reload(writer.getState(), writer.getRevision()) : follower.applyRemote(remoteChange(synced, writer, pending));
          expect(result.ok).toBe(true);
          synced = writer.getRevision();
          pending.length = 0;
          // A remote or reload ChangeSet is never applied one by one: it is ONE build at the next read.
          const before = derived.stats();
          expectEqualsBuild(derived, follower, universe, `follower after ${step.then} ${i}`);
          expect(derived.stats().applies).toBe(before.applies);
        }
        expectEqualsBuild(derived, follower, universe, 'follower final');
        // A boot from the stored state: a fresh store, a fresh service, same answers.
        const rebooted = createCanonicalStore({ initial: writer.getState(), revision: writer.getRevision() });
        expectEqualsBuild(createDerivedIndexes({ store: rebooted, clock: clock() }), rebooted, universe, 'reboot');
      }),
      PARAMS,
    );
  });
});
