/**
 * Step 4.3a (docs/PERFORMANCE_ARCHITECTURE.md has no chem row yet; informal, reported in PROGRESS.md), real RDKit MinimalLib:
 *  - WASM init: loading the module in process, a cold real thread (spawn, load, first parse) and the first parse after a restart
 *    (terminate on a short limit, then a NEW thread loads the WASM again);
 *  - parse and depict of a typical demo species (ethanol) and the largest one (benzoyl peroxide), in process, no cache;
 *  - a 20,000-character SMILES: parse in process; depict through a real thread, where it runs into the 2 s limit;
 *  - the sanitiser on a typical RDKit depiction.
 * Threads run under tsx, so a spawn includes transpiling the fixture: a cold-start figure for TESTS; the browser worker is
 * bundled. Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { afterAll, bench, describe } from 'vitest';
import { createRdkitToolkit, loadRdkit, sanitizeSvg, type DepictionOptions, type RdkitModule } from '@/chem';
import type { StructureRep } from '@/core/schema';
import { SLOW_BENCH_OPTIONS } from '@/test-support/perf-kit';
import { spawnChemWorker } from '@/test-support/rpc-node-port';
import { createChemService } from '@/workers/chem/client';
import { CHEM_SPECS } from '@/workers/chem/specs';
import { createRpcClient, createWarmUpGate, type RpcClient } from '@/workers/rpc';
import type { ChemWorkerApi } from '@/workers/rpc/contracts';

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });
const DRAW: DepictionOptions = { width: 300, height: 200, showAtomMaps: true };
const ETHANOL = smiles('CCO');
const PEROXIDE = smiles('O=C(OOC(=O)c1ccccc1)c1ccccc1');
const BIG = smiles(`${'C.'.repeat(9_999)}CC`); // 20,000 characters, 10,001 fragments
const HANGS = smiles('C1CCCCC1'.repeat(500));
/** The limit of the call that is killed to force a restart (also written in the bench title). */
const RESTART_LIMIT_MS = 50;

const fail = (what: string, answer: unknown): never => {
  throw new Error(`bench: ${what} failed: ${JSON.stringify(answer).slice(0, 300)}`);
};

const shared: RdkitModule = await loadRdkit();
const toolkit = createRdkitToolkit({ load: async () => shared });
await toolkit.ready();

const clients: RpcClient<ChemWorkerApi>[] = [];
const freshThread = () => {
  const gate = createWarmUpGate<ChemWorkerApi>();
  const client = createRpcClient<ChemWorkerApi>({ factory: spawnChemWorker, specs: CHEM_SPECS, options: { maxRestarts: 1_000, onRestart: gate.onRestart } });
  clients.push(client);
  return { client, chem: createChemService(client, gate) };
};
afterAll(() => {
  for (const client of clients.splice(0)) client.terminate();
});

describe('chem: WASM init', () => {
  bench(
    'loadRdkit() in process: read and compile the 7 MB WASM, instantiate, disable logging',
    async () => {
      await loadRdkit();
    },
    SLOW_BENCH_OPTIONS,
  );

  bench(
    'real thread, cold: spawn a thread, load RDKit, first parse of ethanol',
    async () => {
      const { client, chem } = freshThread();
      const out = await chem.parse(ETHANOL);
      client.terminate();
      if (!out.ok) fail('parse', out);
    },
    SLOW_BENCH_OPTIONS,
  );

  bench(
    'real thread, after a restart: a call limited to 50 ms terminates the thread, then the first parse in the NEW thread (the 50 ms limit is in the figure)',
    async () => {
      const { client, chem } = freshThread();
      await chem.parse(ETHANOL); // a first thread, up and loaded (not part of what is asked, but the restart needs a thread to kill)
      const hung = await chem.parse(HANGS, { timeoutMs: RESTART_LIMIT_MS });
      const out = await chem.parse(ETHANOL);
      client.terminate();
      if (hung.ok || hung.reason !== 'timeout') fail('the hanging parse did not time out', hung);
      if (!out.ok) fail('parse after the restart', out);
    },
    SLOW_BENCH_OPTIONS,
  );
});

describe('chem: parse and depict of demo species (in process, no cache)', () => {
  bench('parse ethanol (3 heavy atoms)', async () => {
    const out = await toolkit.parse(ETHANOL);
    if (!out.ok) fail('parse', out);
  });
  bench('depict ethanol, 300 x 200, sanitised', async () => {
    const out = await toolkit.depict(ETHANOL, DRAW);
    if (!out.ok) fail('depict', out);
  });
  bench('parse benzoyl peroxide (18 heavy atoms, the largest demo species)', async () => {
    const out = await toolkit.parse(PEROXIDE);
    if (!out.ok) fail('parse', out);
  });
  bench('depict benzoyl peroxide, 300 x 200, sanitised', async () => {
    const out = await toolkit.depict(PEROXIDE, DRAW);
    if (!out.ok) fail('depict', out);
  });
});

describe('chem: a 20,000-character SMILES', () => {
  bench(
    'parse in process (10,001 fragments): facts, canonical SMILES of 20,000 characters',
    async () => {
      const out = await toolkit.parse(BIG);
      if (!out.ok) fail('parse', out);
    },
    SLOW_BENCH_OPTIONS,
  );

  bench(
    'depict through a real thread: runs into the 2 s limit, answers timeout, the thread is replaced (thread start and restart included)',
    async () => {
      const { client, chem } = freshThread();
      await chem.parse(ETHANOL);
      const out = await chem.depict(BIG, DRAW);
      client.terminate();
      if (out.ok || out.reason !== 'timeout') fail('the depiction did not time out', out);
    },
    { time: 1, iterations: 3, warmupTime: 0, warmupIterations: 0 },
  );
});

describe('chem: the sanitiser on a typical RDKit depiction', async () => {
  const drawn = async (structure: StructureRep): Promise<string> => {
    const mol = shared.get_mol(structure.value);
    if (mol === null) throw new Error('bench: RDKit cannot read the structure');
    const svg = mol.get_svg_with_highlights(JSON.stringify({ width: 300, height: 200 }));
    mol.delete();
    return svg;
  };
  const small = await drawn(ETHANOL);
  const large = await drawn(PEROXIDE);

  bench("sanitise ethanol's drawing", () => {
    if (!sanitizeSvg(small).ok) fail('sanitise', small);
  });
  bench("sanitise benzoyl peroxide's drawing", () => {
    if (!sanitizeSvg(large).ok) fail('sanitise', large);
  });
});
