/**
 * Step 4.2b over a REAL `worker_threads` thread running the real compute entry (`startComputeHost`) under tsx: the sync
 * keeps the thread's replica equal to the store, and an induced crash (the thread exits when a request for a chosen
 * method arrives) is answered by restart, `onRestart` reloading the replica, and, for an idempotent call, ONE retry
 * (docs/PERSISTENCE.md §12, ADR-034). The in-memory twins are src/workers/compute/sync.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreHandle } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, searchRoutes, type RouteQuery } from '@/core/graph';
import { envelope, makeStore, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import { buildDemoDocument } from '@/test-support/demo';
import { contextOf, sp } from '@/test-support/graph-state';
import { sortedFindings } from '@/test-support/replica-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { COMPUTE_SPECS } from '@/workers/compute/specs';
import { createReplicaSync, type ReplicaSync } from '@/workers/compute/sync';
import type { WorkerEvent } from '@/workers/rpc/contracts';
import { callWithRetry } from '@/workers/rpc/retry';

const ROUTE: RouteQuery = {
  target: sp('propan-2-ol'),
  startFrom: [sp('ethanol')],
  maxSteps: DEFAULT_ROUTE_MAX_STEPS,
  maxRoutes: DEFAULT_ROUTE_MAX_ROUTES,
  assumption: 'side_inputs_available',
  limits: DEFAULT_TRAVERSAL_LIMITS,
};

function demoStore(): StoreHandle {
  const parsed = documentToState(buildDemoDocument());
  if (!parsed.ok) throw new Error('demo dataset has duplicate IDs');
  return makeStore(parsed.state);
}

const editNote = (store: StoreHandle, notes: string): void => {
  const id = Object.keys(store.getState().records.species).sort()[0] ?? '';
  mustCommit(store.dispatch(envelope(`Note ${notes}`, { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', id), { notes }) })));
};

const running: ReplicaSync[] = [];
afterEach(() => {
  for (const sync of running.splice(0)) sync.stop();
});

/** A sync over real threads; thread `n` (0 = first start) crashes on `crashOn[n]` when given. */
function realSync(store: StoreHandle, crashOn: readonly (string | undefined)[] = []): { readonly sync: ReplicaSync; readonly events: WorkerEvent[]; readonly threads: () => number } {
  const events: WorkerEvent[] = [];
  let started = 0;
  const sync = createReplicaSync({
    store,
    factory: () => spawnComputeWorker(crashOn[started++]),
    onEvent: (event) => events.push(event),
  });
  running.push(sync);
  return { sync, events, threads: () => started };
}

describe('the compute worker in a real thread', () => {
  it('follows the store (commit, undo, redo, replace); its findings and routes equal the store and the core search', async () => {
    const store = demoStore();
    const { sync } = realSync(store);
    await sync.settled();
    editNote(store, 'one');
    editNote(store, 'two');
    store.undo();
    store.redo();
    const other = demoStore().getState();
    mustCommit(store.replaceState(other, 'import'));
    editNote(store, 'after the import');
    const settled = await sync.settled();
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: store.getRevision(), reloads: 1 });

    const revision = store.getRevision();
    const findings = await callWithRetry(sync.client, COMPUTE_SPECS, 'validateAll', { revision });
    expect(findings.ok && findings.value.ok && sortedFindings(findings.value.findings)).toEqual(sortedFindings(store.findings.all()));
    const routes = await callWithRetry(sync.client, COMPUTE_SPECS, 'findRoutes', { revision, query: ROUTE });
    expect(routes.ok && routes.value.ok && routes.value.result).toEqual(searchRoutes(contextOf(store.getState()), ROUTE));
    const stale = await sync.client.validateAll({ revision: revision + 1 });
    expect(stale.ok && stale.value).toEqual({ ok: false, code: 'REPLICA_STALE', have: revision });
  }, 60_000);

  it('a crash under an idempotent call: restart, the hook reloads the replica, the call is retried once and answers', async () => {
    const store = demoStore();
    const { sync, events, threads } = realSync(store, ['validateAll']);
    await sync.settled();
    editNote(store, 'before the crash');
    await sync.settled();
    const answer = await callWithRetry(sync.client, COMPUTE_SPECS, 'validateAll', { revision: store.getRevision() });
    expect(threads()).toBe(2);
    expect(events.filter((event) => event.type === 'crash')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'restart')).toHaveLength(1);
    expect(answer.ok && answer.value.ok && sortedFindings(answer.value.findings)).toEqual(sortedFindings(store.findings.all()));
    expect(sync.status()).toMatchObject({ state: 'in_sync', replicaRevision: 1, reloads: 2 });
    // The reloaded replica keeps following.
    editNote(store, 'after the restart');
    await sync.settled();
    const again = await sync.client.validateAll({ revision: store.getRevision() });
    expect(again.ok && again.value.ok && sortedFindings(again.value.findings)).toEqual(sortedFindings(store.findings.all()));
  }, 60_000);

  it('a crash under applyChanges: the replica is reloaded from the store, the apply is not repeated, following goes on', async () => {
    const store = demoStore();
    const { sync, events, threads } = realSync(store, ['applyChanges']);
    await sync.settled();
    editNote(store, 'the thread dies on this one');
    editNote(store, 'and this one is inside the reload');
    const settled = await sync.settled();
    expect(threads()).toBe(2);
    expect(settled).toMatchObject({ state: 'in_sync', replicaRevision: 2, storeRevision: 2 });
    expect(events.some((event) => event.type === 'crash')).toBe(true);
    expect(events.filter((event) => event.type === 'replica_status').map((event) => (event as { status: string }).status)).toEqual(['reloading', 'in_sync', 'reloading', 'in_sync']);
    const findings = await sync.client.validateAll({ revision: 2 });
    expect(findings.ok && findings.value.ok && sortedFindings(findings.value.findings)).toEqual(sortedFindings(store.findings.all()));
  }, 60_000);
});
