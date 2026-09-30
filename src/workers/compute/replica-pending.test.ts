/**
 * The replica's PENDING state (step 4.2c): `prepare` builds the replica for an imported state without touching the current
 * one, `adopt` swaps it in once (revision rules as values), `drop` forgets it, and a load or an ordinary apply supersedes it.
 * The findings `prepare` answers are exactly what the store takes as precomputed (`verifyPrecomputed` on).
 */
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { CanonicalState } from '@/core/schema';
import { envelope, makeStore, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import { expectReplicaEqualsStore, loadedReplica, sortedFindings } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { RpcHostError } from '@/workers/rpc/helpers';
import { createReplica } from './replica';

const MAX = loadFixtureState('maximal-valid');
const speciesId = Object.keys(MAX.records.species).sort()[0] as string;
const imported: CanonicalState = produce(MAX, (draft) => {
  (draft.records.species[speciesId] as unknown as { notes: string }).notes = 'imported';
});

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof RpcHostError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
};

describe('prepare', () => {
  it('builds the pending replica for revision + 1, answers findings the store accepts as precomputed, and leaves the current replica alone', () => {
    const store = makeStore(MAX, { verifyPrecomputed: true, revision: 3 });
    const replica = loadedReplica(store.getState(), 3);
    const before = replica.snapshot();
    const precomputed = replica.prepare(imported, 4);
    expect(precomputed).toMatchObject({ revision: 4 });
    expect(replica.pendingRevision()).toBe(4);
    expect(replica.revision()).toBe(3);
    expect(replica.snapshot().state).toBe(before.state);
    expect(mustCommit(store.replaceState(imported, 'import', precomputed)).changes.revision).toBe(4);
    expect(sortedFindings(store.findings.all())).toEqual(sortedFindings(precomputed.findings));
  });

  it('needs a loaded replica (NOT_READY) and the next revision (BAD_REQUEST); a refusal keeps an earlier pending state', () => {
    const fresh = createReplica();
    expect(codeOf(() => fresh.prepare(imported, 1))).toBe('NOT_READY');
    const replica = loadedReplica(MAX, 0);
    replica.prepare(imported, 1);
    expect(codeOf(() => replica.prepare(imported, 5))).toBe('BAD_REQUEST');
    expect(codeOf(() => replica.prepare({ meta: MAX.meta } as unknown as CanonicalState, 1))).toBe('BAD_REQUEST');
    expect(replica.pendingRevision()).toBe(1);
  });

  it('a new prepare replaces the pending state; there is at most one', () => {
    const replica = loadedReplica(MAX, 0);
    replica.prepare(imported, 1);
    replica.prepare(MAX, 1);
    expect(replica.adopt(1)).toEqual({ ok: true, revision: 1 });
    expect(replica.snapshot().state).toEqual(MAX);
  });
});

describe('adopt', () => {
  it('makes the pending state THE replica: state, revision, indexes and findings equal a store that replaced its state', () => {
    const store = makeStore(MAX, { revision: 0 });
    const replica = loadedReplica(store.getState(), 0);
    const precomputed = replica.prepare(imported, 1);
    mustCommit(store.replaceState(imported, 'import', precomputed));
    expect(replica.adopt(1)).toEqual({ ok: true, revision: 1 });
    expect(replica.pendingRevision()).toBeUndefined();
    expectReplicaEqualsStore(replica, store, 'after adopt');
    // It goes on following ordinary commits from there.
    const change = mustCommit(store.dispatch(envelope('note', { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', speciesId), { notes: 'later' }) }))).changes;
    expect(replica.apply(structuredClone(change))).toEqual({ ok: true, revision: 2 });
    expectReplicaEqualsStore(replica, store, 'after a later commit');
  });

  it('refuses as values and changes nothing: no pending state, another revision, a replica that moved on', () => {
    const replica = loadedReplica(MAX, 0);
    expect(replica.adopt(1)).toMatchObject({ ok: false, code: 'NO_PENDING', have: 0 });
    replica.prepare(imported, 1);
    expect(replica.adopt(2)).toMatchObject({ ok: false, code: 'PENDING_REVISION', have: 0 });
    expect(replica.pendingRevision()).toBe(1);
    expect(createReplica().adopt(1)).toMatchObject({ ok: false, code: 'REPLICA_STALE', have: null });
    // Adopting twice: the second one has nothing to adopt.
    expect(replica.adopt(1).ok).toBe(true);
    expect(replica.adopt(1)).toMatchObject({ ok: false, code: 'NO_PENDING' });
  });
});

describe('drop, and what supersedes a pending state', () => {
  it('drop forgets it (true once, then false) and the replica is as it was', () => {
    const replica = loadedReplica(MAX, 0);
    const held = replica.snapshot();
    replica.prepare(imported, 1);
    expect(replica.drop()).toBe(true);
    expect(replica.drop()).toBe(false);
    expect(replica.adopt(1)).toMatchObject({ ok: false, code: 'NO_PENDING' });
    expect(replica.snapshot().state).toBe(held.state);
  });

  it('a load and an ordinary apply both drop it (a pending state is only meaningful for the revision it follows)', () => {
    const store = makeStore(MAX, { revision: 0 });
    const replica = loadedReplica(store.getState(), 0);
    replica.prepare(imported, 1);
    replica.load(MAX, 0);
    expect(replica.pendingRevision()).toBeUndefined();
    replica.prepare(imported, 1);
    const change = mustCommit(store.dispatch(envelope('note', { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', speciesId), { notes: 'other' }) }))).changes;
    expect(replica.apply(change).ok).toBe(true);
    expect(replica.pendingRevision()).toBeUndefined();
  });
});
