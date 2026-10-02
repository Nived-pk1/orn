/**
 * Engine warmUp (step 5.0, Phase 5 contract decisions Q7, ADR-034 dated line, note E4) over the in-memory port (every message passes
 * `structuredClone`) with an injected loader and fake timers: a load slower than the 2 s call limit but inside the load limit is no
 * timeout and no restart; a loader that fails answers values and nothing restarts; a loader past the load limit is an ordinary RPC
 * TIMEOUT (restart, counted towards `maxRestarts`, `gave_up` at the cap); `onRestart` warms up again only if the engine had been
 * warmed. The same for ELK behind the layout service. The handlers' warmUp is idempotent and times itself with the injected clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRdkitToolkit, withChemCache } from '@/chem';
import type { StructureRep } from '@/core/schema';
import type { LayoutRequest } from '@/layout/contracts';
import { createElkEngine } from '@/layout/elk';
import { createFakeElk } from '@/test-support/layout-fakes';
import { request } from '@/test-support/layout-kit';
import { createFakeRdkit, ETHANOL_SPEC } from '@/test-support/fake-rdkit';
import { createMemoryWorkers, type MemoryWorker } from '@/test-support/rpc-memory-port';
import { createChemService } from '@/workers/chem/client';
import { createChemHandlers } from '@/workers/chem/handlers';
import { CHEM_SPECS } from '@/workers/chem/specs';
import { createLayoutHandlers } from '@/workers/layout/handlers';
import { createLayoutService } from '@/workers/layout/service';
import { LAYOUT_SPECS } from '@/workers/layout/specs';
import { createRpcClient, createRpcHost, createWarmUpGate } from '@/workers/rpc';
import { ENGINE_LOAD_TIMEOUT_MS, type ChemWorkerApi, type LayoutWorkerApi, type WarmUpResult, type WorkerEvent } from '@/workers/rpc/contracts';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const never = (): Promise<never> => new Promise(() => undefined);
const methodsReceived = (worker: MemoryWorker | undefined): string[] => (worker?.received ?? []).flatMap((m) => (m.type === 'request' ? [m.method] : []));
const ctx = { signal: new AbortController().signal, progress: () => undefined };

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

function chemRig(load: () => Promise<ReturnType<typeof createFakeRdkit>['module']>, maxRestarts = 3) {
  const events: WorkerEvent[] = [];
  const toolkit = withChemCache(createRdkitToolkit({ load }));
  const workers = createMemoryWorkers((worker) => void createRpcHost(worker.host, createChemHandlers(toolkit, () => performance.now())));
  const gate = createWarmUpGate<ChemWorkerApi>();
  const client = createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS, options: { maxRestarts, onRestart: gate.onRestart, onEvent: (e) => events.push(e) } });
  return { events, workers, gate, chem: createChemService(client, gate) };
}
const types = (events: readonly WorkerEvent[]) => events.map((e) => e.type);

describe('chem warmUp: a load slower than the 2 s call limit', () => {
  it('inside the load limit is no timeout and no restart; the call that waited behind it answers, and the next call does not warm up again', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const { chem, events, workers, gate } = chemRig(() => new Promise((resolve) => setTimeout(() => resolve(fake.module), 5_000)));
    const first = chem.parse(smiles('CCO'));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await first).toMatchObject({ ok: true, facts: { formula: 'C2H6O' } });
    expect(await chem.parse(smiles('CCO'))).toMatchObject({ ok: true });
    expect(events).toEqual([]);
    expect(workers.workers).toHaveLength(1);
    expect(methodsReceived(workers.workers[0])).toEqual(['warmUp', 'parse', 'parse']);
    expect(gate.state()).toBe('warm');
  });

  it('calls made while the engine loads wait behind ONE warmUp and are all answered', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const { chem, workers } = chemRig(() => new Promise((resolve) => setTimeout(() => resolve(fake.module), 3_000)));
    const calls = [chem.parse(smiles('CCO')), chem.parse(smiles('CCO')), chem.depict(smiles('CCO'), { width: 200, height: 150, showAtomMaps: true })];
    await vi.advanceTimersByTimeAsync(3_000);
    expect((await Promise.all(calls)).every((out) => out.ok)).toBe(true);
    expect(methodsReceived(workers.workers[0]).filter((m) => m === 'warmUp')).toHaveLength(1);
  });
});

describe('chem warmUp: a loader that fails', () => {
  it('answers values: every call is `unavailable` with the worker\'s message, nothing restarts, and the engine is not asked again per call', async () => {
    let loads = 0;
    const { chem, events, workers, gate } = chemRig(async () => {
      loads += 1;
      throw new Error('the wasm file is blocked');
    });
    const out = await chem.parse(smiles('CCO'));
    expect(out).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(out.ok ? '' : out.error).toContain('could not be loaded');
    expect(await chem.checkSpecies([{ id: 'a', structure: smiles('CCO') }])).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await chem.depict(smiles('CCO'), { width: 200, height: 150, showAtomMaps: true })).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(events).toEqual([]);
    expect(workers.workers).toHaveLength(1);
    expect(methodsReceived(workers.workers[0])).toEqual(['warmUp']); // no real call was sent, and no second warm-up
    expect(loads).toBe(1);
    expect(gate.state()).toBe('unavailable');
  });
});

describe('chem warmUp: a loader past the load limit', () => {
  it('is an ordinary RPC TIMEOUT: the worker restarts (the new one is not warmed: it never was), each try counts, and the cap ends in gave_up as a status', async () => {
    const { chem, events, workers, gate } = chemRig(never, 2);
    const first = chem.parse(smiles('CCO'));
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_TIMEOUT_MS);
    const out = await first;
    expect(out).toMatchObject({ ok: false, reason: 'timeout' });
    expect(out.ok ? '' : out.error).toContain(`${ENGINE_LOAD_TIMEOUT_MS} ms`);
    expect(types(events)).toEqual(['timeout', 'restart']);
    expect(workers.workers).toHaveLength(2);
    expect(methodsReceived(workers.workers[1])).toEqual([]); // onRestart did not warm up: the engine had never been warmed
    expect(gate.state()).toBe('cold');

    const second = chem.parse(smiles('CCO')); // tries again on the new worker
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_TIMEOUT_MS);
    expect(await second).toMatchObject({ ok: false, reason: 'timeout' });
    const third = chem.parse(smiles('CCO'));
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_TIMEOUT_MS);
    expect(await third).toMatchObject({ ok: false, reason: 'timeout' });
    expect(types(events)).toContain('gave_up');
    expect(events.find((e) => e.type === 'gave_up')).toMatchObject({ reason: 'restart_cap' });
    expect(await chem.parse(smiles('CCO'))).toMatchObject({ ok: false, reason: 'unavailable' }); // down for good, a value
  });
});

describe('chem warmUp: onRestart', () => {
  it('re-warms the new worker ONLY because the engine had been warmed, before the next call reaches it', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const { chem, workers, events } = chemRig(async () => fake.module);
    expect(await chem.parse(smiles('CCO'))).toMatchObject({ ok: true });
    workers.workers[0]?.crash('exit');
    await vi.advanceTimersByTimeAsync(0);
    expect(await chem.parse(smiles('CCO'))).toMatchObject({ ok: true });
    expect(workers.workers).toHaveLength(2);
    expect(methodsReceived(workers.workers[1])).toEqual(['warmUp', 'parse']);
    expect(types(events)).toEqual(['crash', 'restart']);
  });
});

describe('the chem warmUp handler', () => {
  it('is idempotent (the loader runs once), times itself with the injected clock, and every result passes structuredClone', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    let loads = 0;
    const ticks = [100, 350, 400, 400];
    const handlers = createChemHandlers(
      withChemCache(createRdkitToolkit({ load: async () => ((loads += 1), fake.module) })),
      () => ticks.shift() ?? 400,
    );
    const first = await handlers.warmUp({}, ctx);
    const second = await handlers.warmUp({}, ctx);
    expect(first).toEqual({ ok: true, loadMs: 250 });
    expect(second).toEqual({ ok: true, loadMs: 0 });
    expect(loads).toBe(1);
    const failed = await createChemHandlers(withChemCache(createRdkitToolkit({ load: async () => Promise.reject(new Error('no wasm')) })), () => 0).warmUp({}, ctx);
    expect(failed).toMatchObject({ ok: false, reason: 'engine_unavailable' });
    for (const result of [first, second, failed] satisfies WarmUpResult[]) expect(structuredClone(result)).toEqual(result);
    expect(structuredClone({})).toEqual({});
  });
});

function layoutRig(options: { make?: () => ReturnType<ReturnType<typeof createFakeElk>['make']>; maxRestarts?: number } = {}) {
  const elk = createFakeElk();
  const events: WorkerEvent[] = [];
  const make = options.make ?? elk.make;
  const clock = () => performance.now();
  const workers = createMemoryWorkers((worker) => void createRpcHost(worker.host, createLayoutHandlers(createElkEngine({ make, clock }), clock)));
  const gate = createWarmUpGate<LayoutWorkerApi>();
  const client = createRpcClient<LayoutWorkerApi>({ factory: workers.factory, specs: LAYOUT_SPECS, options: { maxRestarts: options.maxRestarts ?? 3, onRestart: gate.onRestart, onEvent: (e) => events.push(e) } });
  return { elk, events, workers, gate, service: createLayoutService({ client, gate }) };
}
const small = (): LayoutRequest => request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] });

describe('layout warmUp', () => {
  it('ELK that loads slower than the 2 s call limit but inside the load limit: no timeout, no restart, ELK answers', async () => {
    const probe = createFakeElk();
    let slow = true;
    const { service, events, workers } = layoutRig({
      make: () => {
        if (!slow) return probe.make();
        slow = false;
        return new Promise((resolve) => setTimeout(() => resolve(probe.make()), 6_000));
      },
    });
    const pending = service.layout('view', small());
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await pending).toMatchObject({ ok: true, result: { engine: 'elk' } });
    expect(events).toEqual([]);
    expect(workers.workers).toHaveLength(1);
    expect(methodsReceived(workers.workers[0])).toEqual(['warmUp', 'layout']);
  });

  it('ELK that cannot load answers the fallback layout (engine_unavailable) as a value: no restart, no second warmUp', async () => {
    const { service, elk, events, workers, gate } = layoutRig();
    elk.makeFailure = new Error('no module');
    const out = await service.layout('view', small());
    if (!out.ok) throw new Error(out.message);
    expect(out.result).toMatchObject({ engine: 'fallback', fallbackReason: 'engine_unavailable' });
    expect(await service.layout('view', { ...small(), seed: 4 })).toMatchObject({ ok: true, result: { fallbackReason: 'engine_unavailable' } });
    expect(events).toEqual([]);
    expect(workers.workers).toHaveLength(1);
    expect(methodsReceived(workers.workers[0]).filter((m) => m === 'warmUp')).toHaveLength(1);
    expect(service.stats()).toMatchObject({ fallback: { engine_unavailable: 2 }, unavailable: 0 });
    expect(gate.state()).toBe('unavailable');
  });

  it('ELK past the load limit is TIMEOUT: the worker restarts, and the NEW worker answers the fallback layout (reason timeout)', async () => {
    const { service, events, workers } = layoutRig({ make: never });
    const pending = service.layout('view', small());
    await vi.advanceTimersByTimeAsync(ENGINE_LOAD_TIMEOUT_MS + 100);
    const out = await pending;
    if (!out.ok) throw new Error(out.message);
    expect(out.result).toMatchObject({ engine: 'fallback', fallbackReason: 'timeout' });
    expect(types(events)).toEqual(['timeout', 'restart']);
    expect(workers.workers).toHaveLength(2);
    expect(methodsReceived(workers.workers[1])).toEqual(['layoutFallback']); // no re-warm: the engine had never been warmed
  });

  it('onRestart re-warms ELK in the new worker when it had been warmed', async () => {
    const { service, workers } = layoutRig();
    expect(await service.layout('view', small())).toMatchObject({ ok: true });
    workers.workers[0]?.crash('exit');
    await vi.advanceTimersByTimeAsync(0);
    expect(await service.layout('view', { ...small(), seed: 8 })).toMatchObject({ ok: true, result: { engine: 'elk' } });
    expect(methodsReceived(workers.workers[1])).toEqual(['warmUp', 'layout']);
  });

  it('the warmUp handler is idempotent, times itself with the injected clock, and its results pass structuredClone', async () => {
    const elk = createFakeElk();
    const ticks = [10, 70, 70, 70];
    const handlers = createLayoutHandlers(createElkEngine({ make: elk.make, clock: () => 0 }), () => ticks.shift() ?? 70);
    const first = await handlers.warmUp({}, ctx);
    expect(first).toEqual({ ok: true, loadMs: 60 });
    expect(await handlers.warmUp({}, ctx)).toMatchObject({ ok: true });
    elk.makeFailure = new Error('gone');
    const failed = await handlers.warmUp({}, ctx);
    expect(failed).toMatchObject({ ok: false, reason: 'engine_unavailable' });
    for (const result of [first, failed] satisfies WarmUpResult[]) expect(structuredClone(result)).toEqual(result);
  });
});
