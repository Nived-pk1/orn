/**
 * The replica (step 4.2b): load, apply (revision rules, `REPLICA_STALE` as a value, unchanged on refusal and on failure),
 * `validateAll` and `findRoutes` by revision, the injected clock, and the guard that incremental validation never runs
 * without `previous` (Phase 9 exception 5 must never be the worker's path).
 */
import { describe, expect, it } from 'vitest';
import type { ChangeSet } from '@/core/dataset';
import { documentToState } from '@/core/dataset';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, searchRoutes, type RouteQuery } from '@/core/graph';
import { createValidator, type Validator } from '@/core/validation';
import type { CanonicalState } from '@/core/schema';
import { envelope, makeStore, mustCommit, recordIn, ref, withFields } from '@/test-support/command-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { contextOf, sp } from '@/test-support/graph-state';
import { precomputedOf } from '@/test-support/precomputed-kit';
import { expectFindingsEqualFull, expectReplicaEqualsStore, followingReplica, loadedReplica, sortedFindings } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { RpcHostError } from '@/workers/rpc/helpers';
import { createReplica } from './replica';

const SPECIES = ref('species', 'spc_max-propanone');
const MAX = loadFixtureState('maximal-valid');

const edit = (store: ReturnType<typeof makeStore>, notes: string, id: string = SPECIES.id): ChangeSet => {
  const species = recordIn(store.getState(), 'species', id);
  return mustCommit(store.dispatch(envelope(`Note ${notes}`, { type: 'record.update', record: withFields(species, { notes }) }))).changes;
};

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof RpcHostError ? error.code : `other: ${String(error)}`;
  }
  return undefined;
};

function demoState(): CanonicalState {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
  return parsed.state;
}

const ROUTE: RouteQuery = {
  target: sp('propan-2-ol'),
  startFrom: [sp('ethanol')],
  maxSteps: DEFAULT_ROUTE_MAX_STEPS,
  maxRoutes: DEFAULT_ROUTE_MAX_ROUTES,
  assumption: 'side_inputs_available',
  limits: DEFAULT_TRAVERSAL_LIMITS,
};

const emptyChange = (revision: number, cause: ChangeSet['cause']): ChangeSet => ({ revision, label: 'x', cause, created: [], updated: [], deleted: [], patches: [], inversePatches: [] });

describe('load', () => {
  it('answers exactly what the store takes as precomputed findings (validateAll, rule set, revision, counts)', () => {
    for (const state of [loadFixtureState('minimal-valid'), MAX, demoState()]) {
      const replica = createReplica();
      expect(replica.load(state, 7)).toEqual(precomputedOf(state, 7));
      expect(replica.revision()).toBe(7);
    }
  });

  it('replaces a loaded replica; a refused request leaves it exactly as it was', () => {
    const replica = loadedReplica(MAX, 4);
    const before = replica.snapshot();
    for (const [state, revision] of [[MAX, -1], [MAX, 1.5], [{ meta: MAX.meta } as unknown as CanonicalState, 5], [null as unknown as CanonicalState, 5]] as const) {
      expect(codeOf(() => replica.load(state, revision))).toBe('BAD_REQUEST');
    }
    expect(replica.snapshot()).toEqual(before);
    replica.load(demoState(), 9);
    expect(replica.revision()).toBe(9);
  });

  it('is idempotent: the same load twice gives the same answer and the same replica', () => {
    const replica = createReplica();
    const first = replica.load(MAX, 3);
    expect(replica.load(MAX, 3)).toEqual(first);
    expectFindingsEqualFull(replica, 'after two loads');
  });
});

describe('a replica before load', () => {
  it('answers NOT_READY to every call that needs one', () => {
    const replica = createReplica();
    expect(replica.revision()).toBeNull();
    expect(codeOf(() => replica.apply(emptyChange(1, 'command')))).toBe('NOT_READY');
    expect(codeOf(() => replica.validateAll(0))).toBe('NOT_READY');
    expect(codeOf(() => replica.findRoutes(0, ROUTE))).toBe('NOT_READY');
    expect(codeOf(() => replica.snapshot())).toBe('NOT_READY');
  });
});

describe('apply', () => {
  it('follows the store: commit, undo, redo; state, revision, indexes and findings equal the store', () => {
    const store = makeStore(MAX);
    const { replica } = followingReplica(store);
    edit(store, 'one');
    expectReplicaEqualsStore(replica, store, 'after a commit');
    expect(store.undo()?.ok).toBe(true);
    expectReplicaEqualsStore(replica, store, 'after undo');
    expect(store.redo()?.ok).toBe(true);
    expectReplicaEqualsStore(replica, store, 'after redo');
    expect(replica.revision()).toBe(3);
  });

  it('a ChangeSet that does not follow the replica is REPLICA_STALE, as a value, and changes nothing', () => {
    const store = makeStore(MAX);
    const replica = loadedReplica(store.getState(), store.getRevision());
    const first = edit(store, 'one');
    const second = edit(store, 'two');
    const before = replica.snapshot();
    // A gap (revision 2 while the replica is at 0), then the past (revision 1 again after applying it).
    expect(replica.apply(second)).toEqual({ ok: false, code: 'REPLICA_STALE', have: 0 });
    expect(replica.snapshot()).toEqual(before);
    expect(replica.apply(first)).toEqual({ ok: true, revision: 1 });
    expect(replica.apply(first)).toEqual({ ok: false, code: 'REPLICA_STALE', have: 1 });
    expect(replica.apply(second)).toEqual({ ok: true, revision: 2 });
    expectReplicaEqualsStore(replica, store, 'after the stale answers');
  });

  it('a remote ChangeSet may span revisions (a follower mirroring the writer); a remote one that is not ahead is stale', () => {
    const follower = makeStore(MAX, { readOnly: () => true });
    const { replica } = followingReplica(follower);
    const species = recordIn(MAX, 'species', SPECIES.id);
    const applied = follower.applyRemote({ fromRevision: 0, revision: 5, upserts: [withFields(species, { notes: 'from the writer' })], deletedIds: [] });
    expect(applied.ok).toBe(true);
    expect(replica.revision()).toBe(5);
    expectReplicaEqualsStore(replica, follower, 'after a remote span');
    expect(replica.apply(emptyChange(5, 'remote'))).toEqual({ ok: false, code: 'REPLICA_STALE', have: 5 });
    // Only a remote ChangeSet may skip revisions.
    expect(replica.apply(emptyChange(8, 'command'))).toEqual({ ok: false, code: 'REPLICA_STALE', have: 5 });
  });

  it('a replace ChangeSet (import, restore) is applied incrementally and equals the store', () => {
    const store = makeStore(MAX);
    const { replica } = followingReplica(store);
    expect(store.replaceState(demoState(), 'import').ok).toBe(true);
    expectReplicaEqualsStore(replica, store, 'after replaceState');
  });

  it('a ChangeSet whose patches cannot be applied throws, and the replica stays exactly as it was and usable', () => {
    const store = makeStore(MAX);
    const { replica, unsubscribe } = followingReplica(store);
    unsubscribe();
    const before = replica.snapshot();
    const broken: ChangeSet = { ...emptyChange(1, 'command'), patches: [{ op: 'replace', path: ['records', 'species', 'spc_nothing', 'notes'], value: 'x' }] };
    expect(() => replica.apply(broken)).toThrow();
    expect(replica.snapshot().state).toBe(before.state);
    expect(replica.revision()).toBe(0);
    const good = edit(store, 'after the failure');
    expect(replica.apply(good)).toEqual({ ok: true, revision: 1 });
    expectReplicaEqualsStore(replica, store, 'after a failed apply');
  });
});

describe('validateAll and findRoutes', () => {
  it('answer for the replica revision only; any other revision is REPLICA_STALE with the revision held', () => {
    const replica = loadedReplica(demoState(), 3);
    for (const revision of [2, 4, 0]) {
      expect(replica.validateAll(revision)).toEqual({ ok: false, code: 'REPLICA_STALE', have: 3 });
      expect(replica.findRoutes(revision, ROUTE)).toEqual({ ok: false, code: 'REPLICA_STALE', have: 3 });
    }
  });

  it('validateAll equals a full pass over the replica; findRoutes equals the core search over a fresh index', () => {
    const state = demoState();
    const replica = loadedReplica(state, 3);
    const all = replica.validateAll(3);
    expect(all.ok && sortedFindings(all.findings)).toEqual(sortedFindings(precomputedOf(state, 3).findings));
    const routes = replica.findRoutes(3, ROUTE);
    expect(routes.ok && routes.result).toEqual(searchRoutes(contextOf(state), ROUTE));
    expect(routes.ok && routes.result.routes.length).toBe(2);
  });

  it('routes follow the replica through edits (not the state it was loaded with)', () => {
    const store = makeStore(demoState());
    const { replica } = followingReplica(store);
    const before = replica.findRoutes(0, ROUTE);
    // The reaction and whatever restricts its deletion, in one batch.
    const target = ref('reaction', 'rxn_ethanol-to-ethanal-pcc');
    const owners = [...new Map(store.deleteImpact([target]).blockedBy.map((b) => [b.owner.id, b.owner] as const)).values()];
    mustCommit(store.dispatch(envelope('Delete PCC', ...owners.map((r) => ({ type: 'record.delete' as const, ref: r, mode: 'apply_cascade' as const })), { type: 'record.delete', ref: target, mode: 'apply_cascade' })));
    const after = replica.findRoutes(store.getRevision(), ROUTE);
    expect(before.ok && before.result.routes.length).toBe(2);
    expect(after.ok && after.result.routes.map((r) => r.steps.map((s) => s.reactionId))).toEqual([['rxn_ethanol-to-ethanal-dichromate', 'rxn_methylmgbr-ethanal']]);
  });

  it('the time budget runs on the injected clock; a signal replaces whatever the query carried', () => {
    const state = demoState();
    let now = 0;
    const timed = loadedReplica(state, 1, { nowMs: () => (now += 1_000) }).findRoutes(1, ROUTE);
    expect(timed.ok && timed.result.truncation?.reason).toBe('time_budget');
    // No clock: the time budget is not enforced, nothing is truncated.
    const noClock = loadedReplica(state, 1).findRoutes(1, ROUTE);
    expect(noClock.ok && noClock.result.truncation).toBeNull();
    const controller = new AbortController();
    controller.abort();
    const aborted = loadedReplica(state, 1).findRoutes(1, ROUTE, controller.signal);
    expect(aborted.ok && aborted.result.truncation?.reason).toBe('aborted');
  });
});

describe('incremental validation always passes previous (Phase 9 exception 5)', () => {
  /** Wraps the real validator and records `previous` of every incremental call. */
  function spy(): { readonly validator: Validator; readonly calls: { readonly method: string; readonly previous: CanonicalState | undefined }[] } {
    const real = createValidator();
    const calls: { method: string; previous: CanonicalState | undefined }[] = [];
    return {
      calls,
      validator: {
        ...real,
        validateTouched: (state, indexes, touched, previous) => (calls.push({ method: 'validateTouched', previous }), real.validateTouched(state, indexes, touched, previous)),
        scopeOf: (state, indexes, touched, previous) => (calls.push({ method: 'scopeOf', previous }), real.scopeOf(state, indexes, touched, previous)),
        validateTouchedByRule: (state, indexes, touched, previous, known) =>
          (calls.push({ method: 'validateTouchedByRule', previous }), real.validateTouchedByRule(state, indexes, touched, previous, known)),
      },
    };
  }

  it('every ChangeSet cause (commit, undo, redo, replace, remote) calls validateTouchedByRule with the state before it, and nothing else', () => {
    const { validator, calls } = spy();
    const store = makeStore(MAX);
    const { replica } = followingReplica(store, { validator });
    edit(store, 'one');
    store.undo();
    store.redo();
    store.replaceState(demoState(), 'import');
    const follower = makeStore(MAX, { readOnly: () => true });
    const remoteReplica = followingReplica(follower, { validator }).replica;
    follower.applyRemote({ fromRevision: 0, revision: 4, upserts: [withFields(recordIn(MAX, 'species', SPECIES.id), { notes: 'remote' })], deletedIds: [] });
    expect(replica.revision()).toBe(4);
    expect(remoteReplica.revision()).toBe(4);
    expect(calls).toHaveLength(5);
    expect(calls.every((call) => call.method === 'validateTouchedByRule' && call.previous !== undefined)).toBe(true);
  });

  it('the previous state is the replica state before the change, and the spy would notice a call without it', () => {
    const { validator, calls } = spy();
    const store = makeStore(MAX);
    const { replica } = followingReplica(store, { validator });
    const stateBefore = replica.snapshot().state;
    edit(store, 'one');
    expect(calls[0]?.previous).toBe(stateBefore);
    // Negative control: the same wrapper records a call made the forbidden way.
    validator.validateTouchedByRule(store.getState(), store.getIndexes(), [SPECIES], undefined, store.findings);
    expect(calls.at(-1)?.previous).toBeUndefined();
  });
});

describe('every request and answer crosses a thread', () => {
  it('params and results survive structuredClone unchanged', () => {
    const store = makeStore(demoState());
    const replica = loadedReplica(store.getState(), 0);
    const changes = edit(store, 'clone me', Object.keys(store.getState().records.species).sort()[0] ?? '');
    expect(structuredClone(changes)).toEqual(changes);
    const answers = [
      structuredClone(replica.load(store.getState(), 0)),
      structuredClone(replica.apply(structuredClone(changes))),
      structuredClone(replica.validateAll(1)),
      structuredClone(replica.findRoutes(1, ROUTE)),
      structuredClone(replica.validateAll(9)),
    ];
    expect(answers[1]).toEqual({ ok: true, revision: 1 });
    expect(answers[4]).toEqual({ ok: false, code: 'REPLICA_STALE', have: 1 });
    for (const answer of answers) expect(answer).toEqual(structuredClone(answer));
    expect(() => structuredClone({ state: store.getState(), revision: 1 })).not.toThrow();
  });
});
