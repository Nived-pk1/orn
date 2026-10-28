/**
 * Route search from the app (step 7.2a C3): the compute worker's `findRoutes` behind one function that answers a value in words,
 * is cancellable, and waits once for a replica that is a moment behind. Over the real compute handlers and the demo.
 */
import { describe, expect, it } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { DEFAULT_ROUTE_MAX_ROUTES, DEFAULT_ROUTE_MAX_STEPS, DEFAULT_TRAVERSAL_LIMITS, type RouteQuery } from '@/core/graph';
import { demoState } from '@/test-support/app-boot-kit';
import { sp } from '@/test-support/graph-state';
import { createComputeHandlers } from '@/workers/compute';
import type { ReplicaSync } from '@/workers/compute';
import type { RpcCallOptions } from '@/workers/rpc/contracts';
import { createRouteSearch } from './route-search';

const state = demoState();
const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
const QUERY: RouteQuery = { target: sp('propan-2-ol'), startFrom: [sp('ethanol')], maxSteps: DEFAULT_ROUTE_MAX_STEPS, maxRoutes: DEFAULT_ROUTE_MAX_ROUTES, assumption: 'side_inputs_available', limits: DEFAULT_TRAVERSAL_LIMITS };

function syncOver(handlers: ReturnType<typeof createComputeHandlers>, over: { state?: 'in_sync' | 'down'; staleFirst?: boolean; rpcError?: 'CANCELLED' | 'TIMEOUT' } = {}): ReplicaSync & { settledCalls: number } {
  let stale = over.staleFirst === true;
  const sync = {
    settledCalls: 0,
    client: {
      findRoutes: async (params: never, options?: RpcCallOptions) => {
        if (over.rpcError !== undefined) return { ok: false, error: { code: over.rpcError, message: 'raw worker words' } };
        if (stale) {
          stale = false;
          return { ok: true, value: { ok: false, code: 'REPLICA_STALE', message: 'raw', revision: 0 } };
        }
        return { ok: true, value: await handlers.api.findRoutes(params, { signal: options?.signal ?? new AbortController().signal } as never) };
      },
    },
    status: () => ({ state: over.state ?? 'in_sync' }),
    settled: async () => {
      sync.settledCalls += 1;
      return { state: over.state ?? 'in_sync' };
    },
  };
  return sync as unknown as ReplicaSync & { settledCalls: number };
}

function loaded() {
  const handlers = createComputeHandlers();
  handlers.replica.load(state, store.getRevision());
  return handlers;
}

describe('createRouteSearch', () => {
  it('answers the engine\'s routes in its ranking order', async () => {
    const find = createRouteSearch({ store, sync: () => syncOver(loaded()) });
    const answer = await find(QUERY);
    expect(answer.ok).toBe(true);
    expect(answer.ok && answer.result.routes).toHaveLength(2);
    expect(answer.ok && answer.result.routes[0]?.steps.map((s) => s.reactionId)).toContain('rxn_methylmgbr-ethanal');
  });

  it('waits for the replica once when it is a moment behind, then asks again', async () => {
    const sync = syncOver(loaded(), { staleFirst: true });
    const answer = await createRouteSearch({ store, sync: () => sync })(QUERY);
    expect(answer.ok).toBe(true);
    expect(sync.settledCalls).toBe(1);
  });

  it('a search that was cancelled answers "stopped", in words', async () => {
    const answer = await createRouteSearch({ store, sync: () => syncOver(loaded(), { rpcError: 'CANCELLED' }) })(QUERY);
    expect(answer).toEqual({ ok: false, cancelled: true, message: 'The search was stopped.' });
  });

  it('a signal that is already aborted comes back with the engine\'s truncation "aborted"', async () => {
    const controller = new AbortController();
    controller.abort();
    const answer = await createRouteSearch({ store, sync: () => syncOver(loaded()) })(QUERY, controller.signal);
    expect(answer.ok && answer.result.truncation?.reason).toBe('aborted');
  });

  it('says in words that the worker is down, and when there is none; no worker text or code reaches the answer', async () => {
    const down = await createRouteSearch({ store, sync: () => syncOver(loaded(), { state: 'down' }) })(QUERY);
    expect(down).toMatchObject({ ok: false });
    const none = await createRouteSearch({ store, sync: () => undefined })(QUERY);
    expect(none).toMatchObject({ ok: false });
    const timeout = await createRouteSearch({ store, sync: () => syncOver(loaded(), { rpcError: 'TIMEOUT' }) })(QUERY);
    for (const one of [down, none, timeout]) {
      expect(one.ok).toBe(false);
      expect(JSON.stringify(one)).not.toMatch(/raw|TIMEOUT|CANCELLED|REPLICA|undefined/);
    }
  });
});
