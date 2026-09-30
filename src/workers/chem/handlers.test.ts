/**
 * The chem worker over an in-memory port (step 4.3a; every message passes `structuredClone`): the handlers over the RDKit
 * adapter and its cache, shape checks at the wire (`BAD_REQUEST`), the main-side service turning a call the worker could not
 * answer into a value with a reason (`timeout`, `unavailable`), and one retry after a crash. The real-thread twin, with real
 * RDKit and a real terminate, is tests/integration/chem-worker-threads.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { createRdkitToolkit, withChemCache, type DepictionOptions, type StructureToolkit } from '@/chem';
import type { StructureRep } from '@/core/schema';
import { createFakeRdkit, ETHANOL_SPEC } from '@/test-support/fake-rdkit';
import { createMemoryWorkers, type MemoryWorker } from '@/test-support/rpc-memory-port';
import { createRpcClient, createRpcHost } from '@/workers/rpc';
import type { ChemWorkerApi } from '@/workers/rpc/contracts';
import { createChemService } from './client';
import { createChemHandlers } from './handlers';
import { CHEM_CALL_TIMEOUT_MS, CHEM_SPECS } from './specs';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const DRAW: DepictionOptions = { width: 200, height: 150, showAtomMaps: true };

function rig() {
  const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
  const toolkit = withChemCache(createRdkitToolkit({ load: async () => fake.module }));
  const workers = createMemoryWorkers((worker) => void createRpcHost(worker.host, createChemHandlers(toolkit)));
  const client = createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS });
  return { fake, toolkit, workers, client, chem: createChemService(client) };
}

describe('the chem specs', () => {
  it('every call is idempotent and limited to 2 s (ADR-034, SECURITY §3)', () => {
    expect(CHEM_CALL_TIMEOUT_MS).toBe(2_000);
    const spec = { idempotent: true, timeoutMs: 2_000 };
    expect(CHEM_SPECS).toEqual({ parse: spec, depict: spec, checkSpecies: spec, checkReaction: spec, checkMechanism: spec, matches: spec });
  });
});

describe('the chem handlers', () => {
  it('parse and depict answer values through a port that clones every message; depict answers sanitised svg', async () => {
    const { chem } = rig();
    const parsed = await chem.parse(smiles('CCO'));
    expect(parsed).toMatchObject({ ok: true, facts: { formula: 'C2H6O' } });
    const drawn = await chem.depict(smiles('CCO'), DRAW);
    if (!drawn.ok) throw new Error(drawn.error);
    expect(drawn.depiction.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(true);
    expect(drawn.depiction.svg).not.toContain('<?xml');
  });

  it('the answer for a structure RDKit cannot read, or that is over the cap, is a VALUE with reason invalid, not an error', async () => {
    const { client } = rig();
    const bad = await client.parse({ structure: smiles('C1CC(') });
    expect(bad).toMatchObject({ ok: true, value: { ok: false, reason: 'invalid' } });
    const huge = await client.parse({ structure: smiles('C'.repeat(20_001)) });
    expect(huge).toMatchObject({ ok: true, value: { ok: false, reason: 'invalid' } });
  });

  it('a repeated call is answered from the worker cache (the second call never reaches RDKit)', async () => {
    const { fake, chem, toolkit } = rig();
    await chem.parse(smiles('CCO'));
    await chem.parse(smiles('CCO'));
    await chem.depict(smiles('CCO'), DRAW);
    await chem.depict(smiles('CCO'), { ...DRAW, highlightAtomMaps: [] });
    expect(fake.calls.getMol).toHaveLength(2);
    expect(toolkit.stats()).toMatchObject({ hits: 2, misses: 2 });
  });

  it.each([
    ['no structure', {}],
    ['a null structure', { structure: null }],
    ['a structure without a value', { structure: { format: 'smiles' } }],
    ['a value that is not a string', { structure: { format: 'smiles', value: 42 } }],
    ['an unknown format', { structure: { format: 'inchi', value: 'x' } }],
  ])('parse with %s is BAD_REQUEST (a shape error at the wire)', async (_name, params) => {
    const { client } = rig();
    expect(await client.parse(params as never)).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
  });

  it.each([
    ['no options', undefined],
    ['a width that is a string', { ...DRAW, width: '200' }],
    ['a width below the minimum', { ...DRAW, width: 8 }],
    ['a height above the maximum', { ...DRAW, height: 5_000 }],
    ['showAtomMaps that is not a boolean', { ...DRAW, showAtomMaps: 1 }],
    ['highlights that are not integers', { ...DRAW, highlightAtomMaps: [0.5] }],
  ])('depict with %s is BAD_REQUEST and nothing is loaded or drawn', async (_name, options) => {
    const { client, fake } = rig();
    expect(await client.depict({ structure: smiles('CCO'), options: options as never })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(fake.calls.getMol).toEqual([]);
  });

  it('checkAll, which the plan replaced (Q2), is an unknown method: BAD_REQUEST from the host', async () => {
    const { workers, client } = rig();
    await client.parse({ structure: smiles('CCO') }); // starts the worker
    const worker = workers.workers[0] as MemoryWorker;
    const answers: unknown[] = [];
    worker.port.onMessage((message) => answers.push(message));
    worker.port.postMessage({ type: 'request', id: 999, method: 'checkAll', params: { revision: 0 } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(answers).toEqual([expect.objectContaining({ type: 'response', id: 999, ok: false, error: expect.objectContaining({ code: 'BAD_REQUEST' }) })]);
  });
});

describe('the main-side service', () => {
  /** A worker that answers nothing: a hang, as a synchronous RDKit call would look from outside. */
  function hangingService() {
    const workers = createMemoryWorkers((worker) => {
      const never = (): Promise<never> => new Promise(() => undefined);
      const api: ChemWorkerApi = { parse: never, depict: never, checkSpecies: never, checkReaction: never, checkMechanism: never, matches: never };
      createRpcHost(worker.host, api);
    });
    const client = createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS, options: { maxRestarts: 5 } });
    return { workers, client, chem: createChemService(client) };
  }

  it('a call that runs into its limit is `timeout` (not invalid, not unavailable); the worker is terminated and replaced; it is NOT retried', async () => {
    const { workers, chem } = hangingService();
    const out = await chem.parse(smiles('CCO'), { timeoutMs: 30 });
    expect(out).toMatchObject({ ok: false, reason: 'timeout' });
    expect(out.ok ? '' : out.error).toContain('2000 ms');
    expect(workers.workers[0]?.alive()).toBe(false);
    expect(workers.workers).toHaveLength(2); // restarted, and the call was not repeated on the new worker
    expect(workers.workers[1]?.received.filter((m) => m.type === 'request')).toHaveLength(0);
    const drawn = await chem.depict(smiles('CCO'), DRAW, { timeoutMs: 30 });
    expect(drawn).toMatchObject({ ok: false, reason: 'timeout' });
  });

  it('a crash under a call is retried once (both calls are idempotent) and the second answer is used', async () => {
    let started = 0;
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC });
    const toolkit: StructureToolkit = withChemCache(createRdkitToolkit({ load: async () => fake.module }));
    const workers = createMemoryWorkers((worker) => {
      started += 1;
      const api = createChemHandlers(toolkit);
      if (started === 1) createRpcHost(worker.host, { ...api, parse: async () => (worker.crash('exit'), new Promise(() => undefined)) });
      else createRpcHost(worker.host, api);
    });
    const chem = createChemService(createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS }));
    expect(await chem.parse(smiles('CCO'))).toMatchObject({ ok: true, facts: { formula: 'C2H6O' } });
    expect(started).toBe(2);
  });

  it('a worker that crashes on both attempts is `unavailable`, saying why; a stopped client is `unavailable` too', async () => {
    const workers = createMemoryWorkers((worker) => createRpcHost(worker.host, { parse: async () => (worker.crash('exit'), new Promise(() => undefined)), depict: async () => new Promise(() => undefined) }));
    const client = createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS, options: { maxRestarts: 5 } });
    const chem = createChemService(client);
    const out = await chem.parse(smiles('CCO'));
    expect(out).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(out.ok ? '' : out.error).toContain('WORKER_CRASHED');
    client.terminate();
    expect(await chem.parse(smiles('CCO'))).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(await chem.depict(smiles('CCO'), DRAW)).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

describe('the batch checks over the port (step 4.3b)', () => {
  const side = (label: string, value: string, coefficient = 1) => ({ label, structure: smiles(value), coefficient });

  it('every check answers plain data through a port that clones every message, and names the toolkit', async () => {
    const { chem } = rig();
    const species = await chem.checkSpecies([{ id: 'spc_a', structure: smiles('CCO'), formula: 'C2H5OH', charge: 0 }, { id: 'spc_b', structure: smiles('C1CC(') }]);
    if (!species.ok) throw new Error(species.error);
    expect(species.value.toolkit.name).toBe('rdkit-minimallib');
    expect(species.value.results.map((r) => [r.id, r.status.state, r.drafts.map((d) => d.ruleId)])).toEqual([['spc_a', 'checked', []], ['spc_b', 'checked', ['CHEM-001']]]);
    const balance = await chem.checkReaction([{ path: 'outcomes[0]', reactants: [side('a', 'CCO')], products: [side('b', 'CCO')] }]);
    expect(balance).toMatchObject({ ok: true, value: { results: [{ path: 'outcomes[0]', drafts: [] }] } });
    const steps = await chem.checkMechanism([{ path: 'variants[0].steps[0]', structures: [smiles('CCO')], uses: [{ path: 'variants[0].steps[0].bondsFormed[0]', maps: [1] }] }]);
    expect(steps).toMatchObject({ ok: true, value: { results: [{ drafts: [{ ruleId: 'CHEM-008' }] }] } });
    const matches = await chem.matches([{ structure: smiles('CCO'), smarts: 'CO' }]);
    expect(matches.ok ? matches.value.outcomes : []).toHaveLength(1);
  });

  it('a malformed request is refused at the wire (BAD_REQUEST); a request over the batch cap too; content is never a wire error', async () => {
    const { client } = rig();
    const code = async (answer: Promise<{ readonly ok: boolean; readonly error?: { readonly code: string } }>) => {
      const result = await answer;
      return result.ok ? 'ok' : result.error?.code;
    };
    const species = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `spc_${i}`, structure: smiles('CCO') }));
    expect(await code(client.checkSpecies({ species: species(64) }))).toBe('ok');
    expect(await code(client.checkSpecies({ species: species(65) }))).toBe('BAD_REQUEST');
    expect(await code(client.checkSpecies({ species: 'nope' as never }))).toBe('BAD_REQUEST');
    expect(await code(client.checkSpecies({ species: [{ id: 'a', structure: { format: 'inchi', value: 'x' } }] as never }))).toBe('BAD_REQUEST');
    expect(await code(client.checkSpecies({ species: [{ id: 'a', structure: smiles('CCO'), charge: 1.5 }] as never }))).toBe('BAD_REQUEST');
    expect(await code(client.checkReaction({ outcomes: [{ path: 'o', reactants: [side('a', 'CCO', 0)], products: [] }] }))).toBe('BAD_REQUEST');
    expect(await code(client.checkReaction({ outcomes: [{ path: 'o', reactants: [side('a', 'CCO', Number.NaN)], products: [] }] }))).toBe('BAD_REQUEST');
    expect(await code(client.checkMechanism({ steps: [{ path: 's', structures: [], uses: [{ path: 'u', maps: [1.5] }] }] }))).toBe('BAD_REQUEST');
    expect(await code(client.matches({ probes: [{ structure: smiles('CCO'), smarts: 5 as never }] }))).toBe('BAD_REQUEST');
    expect(await code(client.checkSpecies({ species: [{ id: 'a', structure: smiles('C'.repeat(20_001)) }] }))).toBe('ok'); // too long for RDKit: a value, CHEM-001
  });

  it('a check that runs into its limit is `timeout` for the service (the worker was terminated), and is not retried', async () => {
    const workers = createMemoryWorkers((worker) => {
      const never = (): Promise<never> => new Promise(() => undefined);
      createRpcHost(worker.host, { parse: never, depict: never, checkSpecies: never, checkReaction: never, checkMechanism: never, matches: never });
    });
    const chem = createChemService(createRpcClient<ChemWorkerApi>({ factory: workers.factory, specs: CHEM_SPECS, options: { maxRestarts: 5 } }));
    expect(await chem.checkSpecies([{ id: 'a', structure: smiles('CCO') }], { timeoutMs: 30 })).toMatchObject({ ok: false, reason: 'timeout' });
    expect(workers.workers).toHaveLength(2);
    expect(await chem.matches([], { timeoutMs: 30 })).toMatchObject({ ok: false, reason: 'timeout' });
  });
});
