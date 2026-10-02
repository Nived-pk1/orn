/**
 * What the chem and layout engines share (step 5.1b): a lazily created client (the worker thread starts at the first call), the
 * warm-up gate with `onRestart: gate.onRestart` (a restarted worker re-warms only if the engine had been warmed), the worker's
 * health and the engine's state as AppStatus fields, and `retry()`, which runs ONLY when the user asks (no timer, never per call).
 */
import type { RestartInfo, RpcClient, RpcClientOptions, RpcMethodSpecs, WorkerFactory } from '@/workers/rpc/contracts';
import { createRpcClient } from '@/workers/rpc/client';
import { createWarmUpGate, type WarmableApi, type WarmUpGate } from '@/workers/rpc/warm-up';
import { createLazyClient, type LazyClient } from './lazy-client';
import type { EngineName, EventLogWriter, StatusWriter } from './status';
import { createWorkerHealth, type WorkerHealth } from './worker-health';

export type RetryEngineResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface EngineClientOptions<Api extends WarmableApi<Api>> {
  readonly name: EngineName;
  /** Absent: the environment has no such worker (a status, not an error). */
  readonly factory: WorkerFactory | undefined;
  readonly specs: RpcMethodSpecs<Api>;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
}

export interface EngineClient<Api extends WarmableApi<Api>> {
  /** undefined when the environment has no factory. */
  readonly client: LazyClient<Api> | undefined;
  readonly gate: WarmUpGate<Api>;
  readonly health: WorkerHealth;
  retry(): Promise<RetryEngineResult>;
  stop(): void;
}

export function createEngineClient<Api extends WarmableApi<Api>>(options: EngineClientOptions<Api>): EngineClient<Api> {
  const { name, factory, specs, status, log } = options;
  const gate = createWarmUpGate<Api>();
  const health = createWorkerHealth(name, status, log);
  const unsubscribe = gate.subscribe((state, message) => {
    status.update({ engines: { ...status.get().engines, [name]: { state: state === 'warming' ? 'loading' : state === 'warm' ? 'ready' : state, message } } });
    if (state === 'unavailable') log.add({ source: 'app', event: { type: 'engine_unavailable', message: `the ${name} engine could not load: ${message ?? 'no reason given'}` } });
  });
  let client: LazyClient<Api> | undefined;
  if (factory === undefined) health.absent(`no ${name} worker in this environment`);
  else {
    health.idle();
    const clientOptions: RpcClientOptions<Api> = {
      onRestart: health.restartHook((raw: RpcClient<Api>, info: RestartInfo) => gate.onRestart(raw, info)),
      onEvent: health.onEvent,
    };
    client = createLazyClient<Api>(specs, () => {
      health.started();
      log.add({ source: 'app', event: { type: 'worker_started', message: `the ${name} worker thread was created (first use)` } });
      return createRpcClient<Api>({ factory, specs, options: clientOptions });
    });
  }
  return {
    client,
    gate,
    health,
    async retry() {
      if (client === undefined) return { ok: false, message: `there is no ${name} worker in this environment` };
      if (health.view().state === 'down') return { ok: false, message: `the ${name} worker is down in this tab; reload the page` };
      if (gate.state() === 'warm') return { ok: true };
      gate.retry();
      const outcome = await gate.ready(client, specs);
      if (outcome.ok) return { ok: true };
      return { ok: false, message: outcome.reason === 'engine_unavailable' ? outcome.message : `${outcome.error.code}: ${outcome.error.message}` };
    },
    stop() {
      unsubscribe();
      client?.terminate();
    },
  };
}
