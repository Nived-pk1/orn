/**
 * The chem worker in a REAL `worker_threads` thread running the real chem entry logic (`startChemHost`) over real RDKit under tsx
 * (step 4.3a, ADR-034 D1, SECURITY §3): facts and a sanitised depiction end to end; a call that runs past its 2 s limit is stopped by
 * TERMINATING the thread (RDKit is synchronous and cannot see a cancel), answers `timeout`, and the next call runs in a new thread
 * that loads the WASM again; a WASM trap inside the thread is `unavailable` without a restart. The in-memory twin is
 * src/workers/chem/handlers.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { StructureRep } from '@/core/schema';
import { spawnChemWorker } from '@/test-support/rpc-node-port';
import { createChemService } from '@/workers/chem/client';
import { CHEM_CALL_TIMEOUT_MS, CHEM_SPECS } from '@/workers/chem/specs';
import { createRpcClient, type RpcClient } from '@/workers/rpc';
import type { ChemWorkerApi, WorkerEvent } from '@/workers/rpc/contracts';

/** Starting a thread under tsx takes seconds when the whole suite runs in parallel (the default 5 s is too tight). */
const THREAD_TEST_TIMEOUT_MS = 60_000;
const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const DRAW = { width: 300, height: 200, showAtomMaps: true } as const;

/** Real RDKit does not finish this within any limit we could give it (about 4,000 characters of chained cyclohexane rings: seen to run past 25 s). */
const HANGS_RDKIT = 'C1CCCCC1'.repeat(500);
/** RDKit's stack overflows writing the SMILES of a chain this long: a WASM trap, not a hang. */
const TRAPS_RDKIT = 'C'.repeat(700);

const running: RpcClient<ChemWorkerApi>[] = [];
afterEach(() => {
  for (const client of running.splice(0)) client.terminate();
});

function start() {
  const events: WorkerEvent[] = [];
  const client = createRpcClient<ChemWorkerApi>({ factory: spawnChemWorker, specs: CHEM_SPECS, options: { onEvent: (event) => events.push(event) } });
  running.push(client);
  return { client, events, chem: createChemService(client) };
}

describe('the chem worker in a real thread', () => {
  it('parses and depicts real structures: facts from RDKit, a sanitised drawing, an invalid structure as a value', async () => {
    const { chem, events } = start();
    expect(await chem.parse(smiles('CC(=O)O'))).toMatchObject({ ok: true, facts: { formula: 'C2H4O2', heavyAtomCount: 4, aromatic: false } });
    expect(await chem.parse(smiles('C1CC('))).toMatchObject({ ok: false, reason: 'invalid' });
    const drawn = await chem.depict(smiles('c1ccccc1O'), DRAW);
    if (!drawn.ok) throw new Error(drawn.error);
    expect(drawn.depiction.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(true);
    expect(drawn.depiction.svg).not.toMatch(/<\?xml|<metadata|rdkit|<!--|xlink|href|script/);
    expect(drawn.depiction.svg).toContain('<path ');
    expect(events).toEqual([]); // nothing restarted, nothing crashed
  }, THREAD_TEST_TIMEOUT_MS);

  it('a call over the 2 s limit answers `timeout`, terminates the thread, and the next call is served by a NEW thread that loads RDKit again', async () => {
    const { chem, events } = start();
    expect((await chem.parse(smiles('CCO'))).ok).toBe(true); // the first thread is up and RDKit is loaded

    const began = performance.now();
    const hung = await chem.parse(smiles(HANGS_RDKIT));
    expect(performance.now() - began).toBeGreaterThanOrEqual(CHEM_CALL_TIMEOUT_MS);
    expect(hung).toMatchObject({ ok: false, reason: 'timeout' });
    expect(events.map((e) => e.type)).toEqual(['timeout', 'restart']);
    expect(events.find((e) => e.type === 'restart')).toMatchObject({ reason: 'timeout' });

    // The new thread starts empty (no cache, no module): this call loads the WASM again and answers.
    expect(await chem.parse(smiles('CCN'))).toMatchObject({ ok: true, facts: { formula: 'C2H7N' } });
    expect(await chem.depict(smiles('CCN'), DRAW)).toMatchObject({ ok: true });
    expect(events.filter((e) => e.type === 'restart')).toHaveLength(1);
  }, THREAD_TEST_TIMEOUT_MS);

  it('a hung depiction is stopped the same way', async () => {
    const { chem } = start();
    const out = await chem.depict(smiles(HANGS_RDKIT), DRAW, { timeoutMs: 800 });
    expect(out).toMatchObject({ ok: false, reason: 'timeout' });
    expect(await chem.depict(smiles('CCO'), DRAW)).toMatchObject({ ok: true });
  }, THREAD_TEST_TIMEOUT_MS);

  it('a WASM trap inside the thread is `unavailable` (the adapter drops the module), not a restart; the same thread goes on', async () => {
    const { chem, events } = start();
    const out = await chem.parse(smiles(TRAPS_RDKIT));
    expect(out).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(out.ok ? '' : out.error).toContain('crashed');
    expect(await chem.parse(smiles('CCO'))).toMatchObject({ ok: true, facts: { formula: 'C2H6O' } });
    expect(events).toEqual([]); // the thread never died: the trap was caught in the adapter
  }, THREAD_TEST_TIMEOUT_MS);

  it('an over-long structure is refused before RDKit, in the thread, as `invalid`', async () => {
    const { chem } = start();
    expect(await chem.parse(smiles('C'.repeat(20_001)))).toMatchObject({ ok: false, reason: 'invalid' });
  }, THREAD_TEST_TIMEOUT_MS);
});
