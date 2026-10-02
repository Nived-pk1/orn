/**
 * Step 4.3b (informal; docs/PERFORMANCE_ARCHITECTURE.md has no L4 row; reported in PROGRESS.md), real RDKit MinimalLib: checking every
 * species of the demo, batched, through the worker code alone, through the L4 service (which also checks the demo's reactions
 * and mechanisms), and in a fresh real thread (cold start included); and the design tier's species count with SYNTHETIC
 * structures, because the generator (src/test-support/generator.ts) gives its species no structure at all.
 * No cache (the toolkit is not wrapped), so every iteration does the real work. Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { afterAll, bench, describe } from 'vitest';
import { createChemChecks, createRdkitToolkit, loadRdkit, type RdkitModule } from '@/chem';
import type { CanonicalState, Species } from '@/core/schema';
import { createFindingStore } from '@/core/validation/store';
import { realChemPort, realIndexes } from '@/test-support/l4-real-kit';
import { demoRecords } from '@/test-support/legacy-classify-kit';
import { stateOfRecords } from '@/test-support/legacy-map-kit';
import { SLOW_BENCH_OPTIONS } from '@/test-support/perf-kit';
import { spawnChemWorker } from '@/test-support/rpc-node-port';
import { createL4Service, L4_BATCH_SIZE } from '@/workers/chem';
import { createChemService } from '@/workers/chem/client';
import { CHEM_SPECS } from '@/workers/chem/specs';
import { createRpcClient, createWarmUpGate, type RpcClient } from '@/workers/rpc';
import type { ChemWorkerApi } from '@/workers/rpc/contracts';

const demo: CanonicalState = stateOfRecords(demoRecords());
const demoSpecies = Object.values(demo.records.species as Readonly<Record<string, Species>>).filter((s) => s.structure !== undefined);

/** 1,400 distinct secondary alcohols R1-CH(OH)-R2 (40 x 35 alkyl lengths, R2 always longer than R1, so no two are the same molecule): the design tier's species count, with structures the generator does not give. */
const SYNTHETIC: CanonicalState = (() => {
  const records: unknown[] = [];
  for (let a = 1; a <= 40; a += 1) {
    for (let k = 0; k < 35; k += 1) {
      const b = a + 2 + k;
      records.push({ id: `spc_syn-${a}-${b}`, kind: 'species', names: { canonical: `syn ${a} ${b}`, common: [], aliases: [] }, structure: { format: 'smiles', value: `C${'C'.repeat(a)}C(${'C'.repeat(b)})O` }, classIds: [] });
    }
  }
  return stateOfRecords(records as never);
})();

const shared: RdkitModule = await loadRdkit();
const uncached = () => createChemChecks(createRdkitToolkit({ load: async () => shared }));
await uncached().checkSpecies([]); // RDKit is loaded before the first measured iteration

const fail = (what: string, answer: unknown): never => {
  throw new Error(`bench: ${what} failed: ${JSON.stringify(answer).slice(0, 300)}`);
};

async function serviceRun(state: CanonicalState, chem: ReturnType<typeof realChemPort>, expectFindings?: (n: number) => boolean): Promise<void> {
  const findings = createFindingStore();
  const service = createL4Service({ state: () => state, findings, indexes: realIndexes(() => state), chem, schedule: () => undefined });
  service.checkAll();
  await service.flush();
  service.dispose();
  if (expectFindings !== undefined && !expectFindings(findings.all({ level: 4 }).length)) fail('the finding count is not what the dataset gives', findings.all({ level: 4 }).length);
}

const clients: RpcClient<ChemWorkerApi>[] = [];
afterAll(() => {
  for (const client of clients.splice(0)) client.terminate();
});

describe('chem checks (step 4.3b)', () => {
  bench(
    'check every species of the demo, 65 structures in batches of 32, worker code only (no service, no cache)',
    async () => {
      const checks = uncached();
      const requests = demoSpecies.map((s) => ({ id: s.id, structure: s.structure as NonNullable<Species['structure']>, ...(s.formula === undefined ? {} : { formula: s.formula }) }));
      for (let i = 0; i < requests.length; i += L4_BATCH_SIZE) {
        const answer = await checks.checkSpecies(requests.slice(i, i + L4_BATCH_SIZE));
        if (answer.results.length === 0) fail('checkSpecies', answer);
      }
    },
    SLOW_BENCH_OPTIONS,
  );

  bench(
    'check the whole demo through the L4 service (65 species, 27 reactions, 3 mechanisms; real RDKit in process, no cache)',
    async () => {
      await serviceRun(demo, realChemPort(uncached()), (n) => n === 2);
    },
    SLOW_BENCH_OPTIONS,
  );

  bench(
    'check the whole demo in a fresh real thread (spawn, load RDKit, three species batches, reactions, mechanisms; thread start under tsx included)',
    async () => {
      const gate = createWarmUpGate<ChemWorkerApi>();
      const client = createRpcClient<ChemWorkerApi>({ factory: spawnChemWorker, specs: CHEM_SPECS, options: { maxRestarts: 1_000, onRestart: gate.onRestart } });
      clients.push(client);
      await serviceRun(demo, createChemService(client, gate), (n) => n === 2);
      client.terminate();
    },
    SLOW_BENCH_OPTIONS,
  );

  bench(
    'check 1,400 synthetic species through the L4 service (the design tier species count; the generator gives no structures; in process, no cache)',
    async () => {
      await serviceRun(SYNTHETIC, realChemPort(uncached()), (n) => n === 0);
    },
    SLOW_BENCH_OPTIONS,
  );
});
