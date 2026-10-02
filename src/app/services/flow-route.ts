/**
 * Which path a flow takes (step 5.1c, decision e; note E7): the compute worker, or the SAME Phase 3 code on this thread. The
 * in-process path is never taken silently: a worker that is down answers `WORKER_DOWN` (with `inProcessAvailable`) and the caller
 * asks again with `{ inProcess: true }`. A refusal for a read-only tab is also decided here.
 */
import type { StoreHandle } from '@/core/commands';
import type { ReplicaSync } from '@/workers/compute';
import type { FlowOptions, FlowRefusal } from './flow-types';

export type Route = { readonly kind: 'worker'; readonly sync: ReplicaSync } | { readonly kind: 'in_process' };

export const isRoute = (value: Route | FlowRefusal): value is Route => 'kind' in value;

export const workerDown = (replica: { sync(): ReplicaSync | undefined }): FlowRefusal | undefined => {
  const sync = replica.sync();
  if (sync !== undefined && sync.status().state !== 'down') return undefined;
  const why = sync === undefined ? 'there is no compute worker' : sync.status().reason;
  return {
    ok: false,
    code: 'WORKER_DOWN',
    message: `the compute worker is down (${why}); the same pipeline can run on this thread: ask again with inProcess set (the page is unresponsive meanwhile)`,
    inProcessAvailable: true,
  };
};

export function routeOf(replica: { sync(): ReplicaSync | undefined }, options: FlowOptions | undefined): Route | FlowRefusal {
  if (options?.inProcess === true) return { kind: 'in_process' };
  const down = workerDown(replica);
  if (down !== undefined) return down;
  return { kind: 'worker', sync: replica.sync() as ReplicaSync };
}

export const readOnlyRefusal = (store: Pick<StoreHandle, 'isReadOnly'>, what: string): FlowRefusal | undefined =>
  store.isReadOnly() ? { ok: false, code: 'READ_ONLY', message: `this tab is not the writer; ${what} is refused (export still works)` } : undefined;

export const cancelledRefusal = (): FlowRefusal => ({ ok: false, code: 'CANCELLED', message: 'cancelled by the caller; nothing was changed' });
