/**
 * Step 6.2a, part 2 (informal; run once, alone; REPORTED): the dry run of one species draft at the design tier (hub_explosion state).
 *  - worker part: `dryRun` in the worker's own code (no thread) over the replica's state and indexes;
 *  - round trip: `checkDraft` through a REAL `worker_threads` compute worker; main-thread part = round trip minus the worker part
 *    (the structured clone of the draft and the answer, the queue and the wake-up).
 * Run: `npx tsx tests/measure/draft-dry-run.measure.ts [samples]`. Three drafts: a new twin of the hub (SPC-001 fires), a clean new
 * species, a draft with a dangling class.
 */
import { performance } from 'node:perf_hooks';
import type { Species } from '@/core/schema';
import { designTierHubState, mostReferencedSpecies, buildIndexes } from '@/test-support/perf-kit';
import { spawnComputeWorker } from '@/test-support/rpc-node-port';
import { must } from '@/test-support/state-fixture';
import { createReplica } from '@/workers/compute/replica';
import { dryRun } from '@/workers/compute/dry-run';
import { COMPUTE_SPECS } from '@/workers/compute/specs';
import { createRpcClient } from '@/workers/rpc';
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';

const stats = (xs: number[]): string => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `mean ${mean.toFixed(3)} ms, p99 ${(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] as number).toFixed(3)} ms, min ${(sorted[0] as number).toFixed(3)}`;
};

async function main(): Promise<void> {
  const samples = Number(process.argv[2] ?? '300');
  const state = designTierHubState();
  const hub = must(state.records.species[mostReferencedSpecies(state, buildIndexes(state)).id]) as Species;
  const drafts: Record<string, unknown> = {
    'new twin of the hub (SPC-001)': { ...hub, id: 'spc_measure-twin' },
    'clean new species': { ...hub, id: 'spc_measure-clean', names: { canonical: 'Measured clean name', common: [], aliases: [] } },
    'dangling class (REF-001)': { ...hub, id: 'spc_measure-dangling', names: { canonical: 'Measured dangling', common: [], aliases: [] }, classIds: ['cls_not-there'] },
  };
  const replica = createReplica();
  replica.load(state, 0);
  const held = replica.snapshot();
  const client = createRpcClient<ComputeWorkerApi>({ factory: () => spawnComputeWorker(), specs: COMPUTE_SPECS });
  const loaded = await client.loadReplica({ state, revision: 0 }, { timeoutMs: 120_000 });
  if (!loaded.ok) throw new Error(`loadReplica failed: ${loaded.error.code}`);
  console.log(`design tier hub_explosion: ${Object.keys(state.records.species).length} species, ${Object.keys(state.records.reaction).length} reactions; ${samples} samples each, node ${process.version}`);
  for (const [label, draft] of Object.entries(drafts)) {
    for (let i = 0; i < 30; i += 1) dryRun(held.state, held.indexes, 'species', draft); // warm-up
    const worker: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const t = performance.now();
      dryRun(held.state, held.indexes, 'species', draft);
      worker.push(performance.now() - t);
    }
    for (let i = 0; i < 20; i += 1) await client.checkDraft({ revision: 0, kind: 'species', draft });
    const trip: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const t = performance.now();
      const answer = await client.checkDraft({ revision: 0, kind: 'species', draft });
      trip.push(performance.now() - t);
      if (!answer.ok) throw new Error('checkDraft failed');
    }
    const mainPart = trip.map((value, i) => Math.max(0, value - (worker[i] as number)));
    console.log(`${label}\n  worker part   ${stats(worker)}\n  round trip    ${stats(trip)}\n  main-thread   ${stats(mainPart)} (round trip minus worker part)`);
  }
  client.terminate();
}

void main();
