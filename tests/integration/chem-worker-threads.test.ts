/**
 * The chem worker in a REAL `worker_threads` thread running the real chem entry logic (`startChemHost`) over real RDKit under tsx
 * (step 4.3a, ADR-034 D1, SECURITY §3): facts and a sanitised depiction end to end; a call that runs past its 2 s limit is stopped by
 * TERMINATING the thread (RDKit is synchronous and cannot see a cancel), answers `timeout`, and the next call runs in a new thread
 * that loads the WASM again; a WASM trap inside the thread is `unavailable` without a restart. The in-memory twin is
 * src/workers/chem/handlers.test.ts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { CanonicalState, StructureRep } from '@/core/schema';
import { spawnChemWorker } from '@/test-support/rpc-node-port';
import { createFindingStore } from '@/core/validation/store';
import { speciesRecord } from '@/test-support/l4-kit';
import { realIndexes } from '@/test-support/l4-real-kit';
import { createL4Service } from '@/workers/chem';
import { createChemService } from '@/workers/chem/client';
import { CHEM_CALL_TIMEOUT_MS, CHEM_SPECS } from '@/workers/chem/specs';
import { createRpcClient, createWarmUpGate, type RpcClient } from '@/workers/rpc';
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
  const gate = createWarmUpGate<ChemWorkerApi>();
  const client = createRpcClient<ChemWorkerApi>({ factory: spawnChemWorker, specs: CHEM_SPECS, options: { onEvent: (event) => events.push(event), onRestart: gate.onRestart } });
  running.push(client);
  /** Loads RDKit in the new thread first (the 20 s load limit), so the 2 s limit below covers calculations only (step 5.0). */
  const warm = () => gate.ready(client, CHEM_SPECS);
  return { client, events, gate, warm, chem: createChemService(client, gate) };
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
    const { chem, warm } = start();
    await warm(); // RDKit is loaded first (step 5.0): the 800 ms below is a calculation limit
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

describe('the batch checks and the L4 service in a real thread (step 4.3b)', () => {
  it('checkSpecies answers real findings, and a trap inside a batch is one item not_checked while the rest are answered', async () => {
    const { chem, events } = start();
    const out = await chem.checkSpecies([
      { id: 'spc_bad', structure: smiles('C1CC(') },
      { id: 'spc_trap', structure: smiles(TRAPS_RDKIT) },
      { id: 'spc_f', structure: smiles('CCO'), formula: 'C2H4O' },
    ]);
    if (!out.ok) throw new Error(out.error);
    expect(out.value.results.map((r) => [r.id, r.status.state, r.drafts.map((d) => d.ruleId)])).toEqual([
      ['spc_bad', 'checked', ['CHEM-001']],
      ['spc_trap', 'not_checked', []],
      ['spc_f', 'checked', ['CHEM-003']],
    ]);
    expect(events).toEqual([]);
  }, THREAD_TEST_TIMEOUT_MS);

  it('a batch with a hanging structure: the call times out (thread terminated), the service sends the items one by one, remembers the culprit and never sends it again', async () => {
    const { client, events, gate, warm } = start();
    await warm();
    const findings = createFindingStore();
    const records = Object.fromEntries([speciesRecord('spc_1', 'CCO'), speciesRecord('spc_h', HANGS_RDKIT), speciesRecord('spc_3', 'CCCO')].map((r) => [r.id, r]));
    const state = { meta: {}, records: { species: records, reaction: {}, mechanism: {}, class: {} } } as unknown as CanonicalState;
    const service = createL4Service({ state: () => state, findings, indexes: realIndexes(() => state), chem: createChemService(client, gate), schedule: () => undefined });
    service.checkAll();
    await service.flush();
    expect(service.statusOf({ kind: 'species', id: 'spc_h' })).toMatchObject({ state: 'not_checked', reason: 'timeout', remembered: true });
    expect(service.statusOf({ kind: 'species', id: 'spc_1' })).toEqual({ state: 'checked', notCompared: [] });
    expect(service.statusOf({ kind: 'species', id: 'spc_3' })).toEqual({ state: 'checked', notCompared: [] });
    expect(findings.all()).toEqual([]); // a hang is never CHEM-001
    expect(events.filter((e) => e.type === 'timeout')).toHaveLength(2); // the whole batch, then the culprit alone
    const calls = service.stats().calls.checkSpecies;
    service.checkAll();
    await service.flush();
    expect(service.stats().calls.checkSpecies).toBe(calls + 1); // the two healthy species only: no third timeout
    expect(events.filter((e) => e.type === 'timeout')).toHaveLength(2);
    service.dispose();
  }, THREAD_TEST_TIMEOUT_MS);
});
