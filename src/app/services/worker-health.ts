/**
 * What the RPC client says about a worker becomes a field of AppStatus and a line of the event log (step 5.1b; nothing about a
 * worker is silent). One per engine worker. `ok` again only when the restart hook has finished (the engine re-warmed, the search
 * index reloading), because until then the worker cannot answer.
 */
import type { RestartInfo, RpcClient, WorkerApi, WorkerEvent } from '@/workers/rpc/contracts';
import type { EventLogWriter, StatusWriter, WorkerName, WorkerView } from './status';

export interface WorkerHealth {
  /** For `RpcClientOptions.onEvent`. */
  onEvent(event: WorkerEvent): void;
  /** Wraps a restart hook: `restarting` while it runs, `ok` after it (unless the worker gave up). */
  restartHook<Api extends WorkerApi<Api>>(hook: (raw: RpcClient<Api>, info: RestartInfo) => void | Promise<void>): (raw: RpcClient<Api>, info: RestartInfo) => Promise<void>;
  /** The thread was created (the first call needed it). */
  started(): void;
  /** The environment gave no factory. */
  absent(reason: string): void;
  /** A factory exists and no thread has been needed yet. */
  idle(): void;
  view(): WorkerView;
}

export function createWorkerHealth(name: WorkerName, status: StatusWriter, log: EventLogWriter): WorkerHealth {
  const set = (patch: Partial<WorkerView>): void => {
    const current = status.get().workers[name];
    status.update({ workers: { ...status.get().workers, [name]: { ...current, ...patch } } });
  };
  return {
    view: () => status.get().workers[name],
    absent: (reason) => set({ state: 'absent', started: false, reason }),
    idle: () => set({ state: 'ok', started: false, reason: 'created at its first use' }),
    started() {
      if (status.get().workers[name].state === 'absent') return;
      set({ state: 'ok', started: true, reason: 'running' });
    },
    onEvent(event) {
      // A response whose call is no longer pending is ignored by the client (never an error); the log says so, with the worker's name.
      if (event.type === 'dropped_response' && event.reason !== 'malformed') {
        log.add({ source: 'app', event: { type: 'late_worker_response', message: `duplicate or late worker response (worker ${name}, id ${event.id})` } });
        return;
      }
      log.add({ source: 'worker', event });
      if (event.type === 'crash') set(event.willRestart ? { state: 'restarting', reason: event.message } : { state: 'down', reason: event.message });
      else if (event.type === 'restart') set({ state: 'restarting', reason: `restarted after a ${event.reason} (${event.restarts} in a row)` });
      else if (event.type === 'gave_up') set({ state: 'down', reason: event.reason === 'restart_cap' ? `gave up after ${event.restarts} restart(s)` : 'no worker could be created' });
    },
    restartHook(hook) {
      return async (raw, info) => {
        try {
          await hook(raw, info);
        } finally {
          if (status.get().workers[name].state === 'restarting') set({ state: 'ok', reason: 'running' });
        }
      };
    },
  };
}
