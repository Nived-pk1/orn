/**
 * Step 5.1b, the engine clients of the app services (headless, in-memory hosts): WHEN each worker thread is created (at its first
 * need, never at boot), a missing factory as a status, the per-worker and per-engine fields of AppStatus, a restarted chem and layout
 * client re-warming through the services (`onRestart: gate.onRestart`), `retryEngine` after a failed load (only when asked, no timer),
 * and the layout notices. Real RDKit/ELK are not used here: fakes behind the real hosts, the real gate and the real RPC clients.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { engineKit, fakeMoleculesFor, type EngineKit } from '@/test-support/app-engines-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';
import { request } from '@/test-support/layout-kit';
import type { RpcPort } from '@/workers/rpc/contracts';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const state = demoState();
async function boot(kit: EngineKit = engineKit({ molecules: fakeMoleculesFor(state) }), withFactories = true) {
  const t = testEnv({ world: await worldHolding(state, 2), ...(withFactories ? { workers: kit.factories } : {}) });
  const services = await booter.bootEnv(t);
  return { services, t, kit };
}
const threads = (kit: EngineKit): [number, number, number] => [kit.chem.workers.length, kit.layout.workers.length, kit.search.workers.length];
const graph = request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] });
const pair = request({ nodes: ['x', 'y'], edges: [['x', 'y']] });
const ethanol = { format: 'smiles', value: 'CCO' } as const;

describe('worker threads are created at their first need', () => {
  it('none at boot; search when its load runs, chem at the first L4 run, layout at the first layout request', async () => {
    const { services, t, kit } = await boot();
    expect(threads(kit)).toEqual([0, 0, 0]);
    expect(services.status.get().workers).toEqual({
      chem: { state: 'ok', started: false, reason: 'created at its first use' },
      layout: { state: 'ok', started: false, reason: 'created at its first use' },
      search: { state: 'ok', started: false, reason: 'created at its first use' },
    });
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toEqual(expect.arrayContaining([200, 400])));
    expect(t.scheduler.fireAfter(200)).toBe(true);
    await vi.waitFor(() => expect(kit.search.workers).toHaveLength(1));
    await services.searchSync()?.flush();
    expect(threads(kit)).toEqual([0, 0, 1]);
    expect(services.status.get().workers.search).toMatchObject({ state: 'ok', started: true });

    expect(t.scheduler.fireAfter(400)).toBe(true);
    await vi.waitFor(() => expect(kit.chem.workers).toHaveLength(1));
    await services.l4.flush();
    expect(threads(kit)).toEqual([1, 0, 1]);
    expect(kit.chem.calls[0]).toBe('0:warmUp'); // the engine was asked to load before the first real call
    expect(services.status.get()).toMatchObject({ engines: { chem: { state: 'ready', message: null }, layout: { state: 'cold' } }, workers: { chem: { started: true }, layout: { started: false } } });

    expect(await services.layout.layout('v', graph)).toMatchObject({ ok: true, result: { engine: 'elk' } });
    expect(threads(kit)).toEqual([1, 1, 1]);
    expect(kit.layout.calls).toEqual(['0:warmUp', '0:layout']);
    expect(services.status.get().engines.layout.state).toBe('ready');
  });

  it('a session that never asks for a layout never creates the layout thread; dispose terminates the threads that exist', async () => {
    const { services, t, kit } = await boot();
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await vi.waitFor(() => expect(kit.search.workers).toHaveLength(1));
    await services.dispose();
    expect(kit.layout.workers).toHaveLength(0);
    expect(kit.search.workers[0]?.alive()).toBe(false);
    expect(t.scheduler.live()).toBe(0);
    expect(await services.layout.layout('v', graph)).toMatchObject({ ok: false });
  });
});

describe('a missing factory is a status, not an error', () => {
  it('every call answers a value, AppStatus says absent, L4 says check unavailable, retryEngine says why', async () => {
    const { services, t } = await boot(undefined, false);
    expect(services.status.get().workers).toMatchObject({ chem: { state: 'absent' }, layout: { state: 'absent' }, search: { state: 'absent' } });
    expect(await services.chem.parse(ethanol)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await services.chem.checkSpecies([{ id: 'x', structure: ethanol }])).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await services.layout.layout('v', graph)).toMatchObject({ ok: false, code: 'UNAVAILABLE' });
    expect(await services.search.search('palette', { text: 'ethanol', limit: 5 })).toMatchObject({ ok: false, code: 'NOT_READY' });
    expect(services.searchSync()).toBeUndefined();
    expect(await services.retryEngine('chem')).toMatchObject({ ok: false, message: expect.stringContaining('no chem worker') });
    expect(await services.retryEngine('layout')).toMatchObject({ ok: false, message: expect.stringContaining('no layout worker') });
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
    t.scheduler.fireAfter(400);
    await services.l4.flush();
    expect(services.status.get().l4).toMatchObject({ state: 'unavailable', message: expect.stringContaining('check unavailable') });
    expect(services.status.get().search.state).toBe('absent');
    expect(services.store.findings.all({ level: 4 })).toEqual([]);
  });
});

describe('a restarted client re-warms through the services (onRestart: gate.onRestart)', () => {
  async function chemReady() {
    const booted = await boot();
    await vi.waitFor(() => expect(booted.t.scheduler.liveDelays()).toContain(400));
    booted.t.scheduler.fireAfter(400);
    await vi.waitFor(() => expect(booted.kit.chem.workers).toHaveLength(1));
    await booted.services.l4.flush();
    return booted;
  }

  it('chem: a crash after the engine was warmed -> restarting, a new thread warms up again, then ok; the call after it works', async () => {
    const { services, kit } = await chemReady();
    expect(services.status.get().engines.chem.state).toBe('ready');
    const seen: string[] = [];
    services.status.subscribe((s) => void (seen.at(-1) !== s.workers.chem.state && seen.push(s.workers.chem.state)));
    kit.chem.workers[0]?.crash('exit');
    await vi.waitFor(() => expect(kit.chem.workers).toHaveLength(2));
    await vi.waitFor(() => expect(kit.chem.calls).toContain('1:warmUp'));
    await vi.waitFor(() => expect(services.status.get().workers.chem.state).toBe('ok'));
    expect(seen).toEqual(['restarting', 'ok']);
    expect(services.status.get().engines.chem.state).toBe('ready');
    expect(await services.chem.parse(ethanol)).toMatchObject({ ok: true });
    expect(kit.chem.calls.filter((c) => c === '1:warmUp')).toHaveLength(1);
    expect(services.log.get().some((e) => e.source === 'worker' && e.event.type === 'restart')).toBe(true);
  });

  it('layout: a crash after the engine was warmed re-warms the new thread', async () => {
    const { services, kit } = await boot();
    await services.layout.layout('v', graph);
    kit.layout.workers[0]?.crash('error');
    await vi.waitFor(() => expect(kit.layout.calls).toContain('1:warmUp'));
    await vi.waitFor(() => expect(services.status.get().workers.layout.state).toBe('ok'));
    expect(await services.layout.layout('w', pair)).toMatchObject({ ok: true });
    expect(kit.layout.calls.filter((c) => c === '1:warmUp')).toHaveLength(1);
  });

  it('search: a crash reloads the index in the new thread (sync.reload in onRestart)', async () => {
    const { services, t, kit } = await boot();
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await vi.waitFor(() => expect(kit.search.workers).toHaveLength(1));
    await services.searchSync()?.flush();
    expect(services.searchSync()?.stats().loads).toBe(1);
    kit.search.workers[0]?.crash('exit');
    await vi.waitFor(() => expect(kit.search.workers).toHaveLength(2));
    await vi.waitFor(() => expect(services.status.get().workers.search.state).toBe('ok'));
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    expect(services.searchSync()?.stats().loads).toBe(2);
    expect(kit.search.engines[1]?.size()).toBeGreaterThan(0);
    expect(await services.search.search('palette', { text: 'ethanol', limit: 5 })).toMatchObject({ ok: true });
  });

  it('a worker that cannot be created again is down for good, as a status', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    const chemFactory = kit.factories.chem;
    let made = 0;
    const flaky = (): RpcPort => {
      made += 1;
      if (made > 1) throw new Error('no more threads');
      return chemFactory();
    };
    const t = testEnv({ world: await worldHolding(state, 2), workers: { ...kit.factories, chem: flaky } });
    const services = await booter.bootEnv(t);
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
    t.scheduler.fireAfter(400);
    await vi.waitFor(() => expect(kit.chem.workers).toHaveLength(1));
    await services.l4.flush();
    kit.chem.workers[0]?.crash('exit');
    await vi.waitFor(() => expect(services.status.get().workers.chem.state).toBe('down'));
    expect(services.status.get().workers.chem.reason).toContain('no worker could be created');
    expect(await services.chem.parse(ethanol)).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(services.status.get().l4).toMatchObject({ state: 'unavailable', message: expect.stringContaining('down') });
    expect(await services.retryEngine('chem')).toMatchObject({ ok: false, message: expect.stringContaining('down') });
  });
});

describe('engine state and retryEngine (decision 3 of the step 5.0 review: only when asked)', () => {
  it('a toolkit that cannot load: unavailable with its message; no retry by a timer or per call; retryEngine loads once and L4 checks again', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    kit.chem.loadFailure = new Error('the wasm file is blocked');
    const { services, t } = await boot(kit);
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
    t.scheduler.fireAfter(400);
    await vi.waitFor(() => expect(services.status.get().engines.chem.state).toBe('unavailable'));
    await services.l4.flush();
    const status = services.status.get();
    expect(status.engines.chem.message).toContain('could not be loaded');
    expect(status.l4).toMatchObject({ state: 'unavailable', message: expect.stringContaining('check unavailable') });
    expect(status.l4.notChecked).toBeGreaterThan(0);
    expect(services.store.findings.all({ level: 4 }).filter((f) => f.ruleId === 'CHEM-001')).toEqual([]); // never CHEM-001
    // more calls do not load the engine again
    await services.chem.parse(ethanol);
    await services.chem.depict(ethanol, { width: 200, height: 150, showAtomMaps: false });
    expect(kit.chem.loads()).toBe(1);
    expect(kit.chem.calls).toEqual(['0:warmUp']);

    kit.chem.loadFailure = undefined;
    expect(await services.retryEngine('chem')).toEqual({ ok: true });
    expect(kit.chem.loads()).toBe(2);
    expect(services.status.get().engines.chem).toEqual({ state: 'ready', message: null });
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400)); // retryEngine queued every structure again
    t.scheduler.fireAfter(400);
    await services.l4.flush();
    await vi.waitFor(() => expect(services.status.get().l4.state).toBe('idle'));
    expect(services.status.get().l4.notChecked).toBe(0);
    expect(services.log.get().some((e) => e.source === 'app' && e.event.type === 'engine_retry')).toBe(true);
  });

  it('a retry of an engine that still cannot load stays unavailable, with the message, as a value', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    kit.chem.loadFailure = new Error('blocked');
    const { services } = await boot(kit);
    await services.chem.parse(ethanol);
    expect(await services.retryEngine('chem')).toMatchObject({ ok: false, message: expect.stringContaining('could not be loaded') });
    expect(services.status.get().engines.chem.state).toBe('unavailable');
    expect(kit.chem.loads()).toBe(2);
  });

  it('retryEngine on a warm engine changes nothing', async () => {
    const { services, kit } = await boot();
    await services.chem.parse(ethanol);
    expect(await services.retryEngine('chem')).toEqual({ ok: true });
    expect(kit.chem.calls.filter((c) => c.endsWith('warmUp'))).toHaveLength(1);
  });

  it('layout: ELK that cannot load answers the fallback layout, the notice is the last notice, and retryEngine loads ELK', async () => {
    const { services, kit } = await boot();
    kit.layout.elk.makeFailure = new Error('elk chunk missing');
    expect(await services.layout.layout('v', graph)).toMatchObject({ ok: true, result: { engine: 'fallback', fallbackReason: 'engine_unavailable' } });
    expect(services.status.get().engines.layout).toMatchObject({ state: 'unavailable', message: expect.any(String) });
    expect(services.status.get().layoutNotice).toMatch(/fallback layout \(engine_unavailable\) of "v"/);
    expect(services.log.get().filter((e) => e.source === 'app' && e.event.type === 'layout_notice')).toHaveLength(1);
    kit.layout.elk.makeFailure = undefined;
    expect(await services.retryEngine('layout')).toEqual({ ok: true });
    expect(await services.layout.layout('w', pair)).toMatchObject({ ok: true, result: { engine: 'elk' } });
    expect(services.status.get().engines.layout.state).toBe('ready');
  });

  it('layout notes (stress over the limit) are reported once; a cached repeat is not reported again', async () => {
    const { services } = await boot();
    const many = request({ nodes: Array.from({ length: 45 }, (_, i) => `n${String(i).padStart(2, '0')}`), algorithm: 'stress' });
    expect(await services.layout.layout('v', many)).toMatchObject({ ok: true });
    const notice = services.status.get().layoutNotice;
    expect(notice).toContain('stress layout is limited to');
    expect(await services.layout.layout('v', many)).toMatchObject({ ok: true, cached: true });
    expect(services.log.get().filter((e) => e.source === 'app' && e.event.type === 'layout_notice')).toHaveLength(1);
    expect(services.status.get().layoutNotice).toBe(notice);
  });
});

describe('every failure is a value or a status', () => {
  it('a chem call that hangs is a timeout value, not an exception, and the worker is restarted', async () => {
    const kit = engineKit({ molecules: fakeMoleculesFor(state) });
    const { services } = await boot(kit);
    await services.chem.parse(ethanol); // warm
    kit.chem.gate = new Promise(() => undefined); // the toolkit hangs from now on
    await expect(services.chem.parse(ethanol, { timeoutMs: 20 })).resolves.toMatchObject({ ok: false, reason: 'timeout' });
    await vi.waitFor(() => expect(kit.chem.workers).toHaveLength(2));
  });
});
