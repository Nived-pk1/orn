/**
 * INV-28 / ADR-033, follower mirror: after random command sequences (undo and redo included) on a writer store, a
 * read-only follower store that applies the writer's changes as coalesced spans of random length (`applyRemote`, the
 * rows re-read as stored) ends equal to the writer: same state, same revision, indexes equal a fresh build, findings
 * equal a full validation. Also with a full `reload` at random points. docs/TEST_STRATEGY.md §4.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalStore, type RemoteChange, type StoreHandle } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import { coreIndexEngine } from '@/core/indexes/engine';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { validator } from '@/core/validation';
import { frozenStateOf, intentsArb, smallParamsArb } from '@/test-support/arbitraries';
import { freshStore, PARAMS, runIntents, TIMEOUT_MS } from './harness';

vi.setConfig({ testTimeout: TIMEOUT_MS });

const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const recordOf = (state: CanonicalState, id: string): AnyRecord | undefined =>
  Object.values(state.records).map((table) => (table as Readonly<Record<string, AnyRecord>>)[id]).find((record) => record !== undefined);

/** What a follower reads from storage after the writer's transactions covering `changes`. */
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

function expectMirror(follower: StoreHandle, writer: StoreHandle): void {
  expect(follower.getState()).toEqual(writer.getState());
  expect(follower.getRevision()).toBe(writer.getRevision());
  const state = follower.getState();
  const fresh = coreIndexEngine.build(state, follower.getRevision());
  const live = follower.getIndexes();
  expect(live.revision).toBe(follower.getRevision());
  for (const table of Object.values(state.records)) {
    for (const record of Object.values(table as Readonly<Record<string, AnyRecord>>)) {
      expect(live.referrersOf(record.id)).toEqual(fresh.referrersOf(record.id));
      expect(live.definersOf(record.id)).toEqual(fresh.definersOf(record.id));
      expect(live.linkersOf(record.id)).toEqual(fresh.linkersOf(record.id));
    }
  }
  expect([...follower.findings.all()].sort(byId)).toEqual([...validator.validateAll(state, fresh)].sort(byId));
}

describe('INV-28 follower mirror ≡ writer', () => {
  it('after random command sequences applied to the follower as random coalesced spans', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(25), fc.array(fc.boolean(), { minLength: 25, maxLength: 25 }), (params, intents, syncAfter) => {
        const initial = frozenStateOf(params);
        const { store: writer, ctx } = freshStore(initial);
        const follower = createCanonicalStore({ initial, readOnly: () => true });
        const pending: ChangeSet[] = [];
        writer.subscribe((changes) => pending.push(changes));
        let synced = 0;
        for (const [i, intent] of intents.entries()) {
          runIntents(writer, [intent], ctx);
          if (syncAfter[i] === true && pending.length > 0) {
            const result = follower.applyRemote(remoteChange(synced, writer, pending));
            expect(result.ok).toBe(true);
            synced = writer.getRevision();
            pending.length = 0;
            expectMirror(follower, writer);
          }
        }
        if (pending.length > 0) {
          expect(follower.applyRemote(remoteChange(synced, writer, pending)).ok).toBe(true);
        }
        expectMirror(follower, writer);
      }),
      PARAMS,
    );
  });

  it('with a full reload at random points, and the follower never gaining history', () => {
    fc.assert(
      fc.property(smallParamsArb, intentsArb(20), fc.array(fc.constantFrom('span', 'reload', 'skip'), { minLength: 20, maxLength: 20 }), (params, intents, plan) => {
        const initial = frozenStateOf(params);
        const { store: writer, ctx } = freshStore(initial);
        const follower = createCanonicalStore({ initial, readOnly: () => true });
        const pending: ChangeSet[] = [];
        writer.subscribe((changes) => pending.push(changes));
        let synced = 0;
        for (const [i, intent] of intents.entries()) {
          runIntents(writer, [intent], ctx);
          const step = plan[i];
          if (pending.length === 0 || step === 'skip') continue;
          if (step === 'reload') expect(follower.reload(writer.getState(), writer.getRevision()).ok).toBe(true);
          else expect(follower.applyRemote(remoteChange(synced, writer, pending)).ok).toBe(true);
          synced = writer.getRevision();
          pending.length = 0;
          expectMirror(follower, writer);
          expect(follower.canUndo()).toBe(false);
          expect(follower.historyLabels()).toEqual({ undo: [], redo: [] });
        }
      }),
      PARAMS,
    );
  });
});
