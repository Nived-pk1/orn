/**
 * Step 6.3a, part 2 (informal; run once, alone; REPORTED): the dry run of one REACTION draft at the design tier (hub_explosion state): the largest
 * reaction of the dataset (most participants, stages and outcomes), edited.
 *  - worker part: `dryRun` in the worker's own code (no thread) over the replica's state and indexes;
 *  - round trip: `checkDraft` through a REAL `worker_threads` compute worker; main-thread part = round trip minus the worker part
 *    (the structured clone of the draft and the answer, the queue and the wake-up).
 * Run: `npx tsx tests/measure/draft-dry-run-reaction.measure.ts [samples]`. Three drafts: a new twin of the hub (SPC-001 fires), a clean new
 * species, a draft with a dangling class.
 */
import { performance } from 'node:perf_hooks';
import type { Reaction } from '@/core/schema';
import { designTierHubState } from '@/test-support/perf-kit';
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
  const size = (r: Reaction): number => r.participants.length + r.stages.length + r.outcomes.length + r.conditionVariants.length + r.intermediates.length;
  const largest = Object.values(state.records.reaction).reduce((a, b) => (size(b) > size(a) ? b : a)) as Reaction;
  const first = must(largest.participants[0]);
  const added = (ref: { kind: string; id: string }): Reaction => ({
    ...largest,
    participants: [...largest.participants, { id: 'prt_measure-added' as never, ref: ref as never, role: first.role }],
    stages: largest.stages.map((stage, i) => (i === 0 ? { ...stage, participantIds: [...stage.participantIds, 'prt_measure-added' as never] } : stage)),
  });
  const drafts: Record<string, unknown> = {
    'largest reaction, unchanged': largest,
    'a participant repeated (RXN-021)': added(first.ref),
    'a dangling participant (REF-001)': added({ kind: 'species', id: 'spc_not-there' }),
  };
  console.log(`largest reaction ${largest.id}: ${largest.participants.length} participants, ${largest.stages.length} stages, ${largest.outcomes.length} outcomes, ${largest.conditionVariants.length} variants`);
  const replica = createReplica();
  replica.load(state, 0);
  const held = replica.snapshot();
  const client = createRpcClient<ComputeWorkerApi>({ factory: () => spawnComputeWorker(), specs: COMPUTE_SPECS });
  const loaded = await client.loadReplica({ state, revision: 0 }, { timeoutMs: 120_000 });
  if (!loaded.ok) throw new Error(`loadReplica failed: ${loaded.error.code}`);
  console.log(`design tier hub_explosion: ${Object.keys(state.records.species).length} species, ${Object.keys(state.records.reaction).length} reactions; ${samples} samples each, node ${process.version}`);
  for (const [label, draft] of Object.entries(drafts)) {
    for (let i = 0; i < 30; i += 1) dryRun(held.state, held.indexes, 'reaction', draft); // warm-up
    const worker: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const t = performance.now();
      dryRun(held.state, held.indexes, 'reaction', draft);
      worker.push(performance.now() - t);
    }
    for (let i = 0; i < 20; i += 1) await client.checkDraft({ revision: 0, kind: 'reaction', draft });
    const trip: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const t = performance.now();
      const answer = await client.checkDraft({ revision: 0, kind: 'reaction', draft });
      trip.push(performance.now() - t);
      if (!answer.ok) throw new Error('checkDraft failed');
    }
    const mainPart = trip.map((value, i) => Math.max(0, value - (worker[i] as number)));
    console.log(`${label}\n  worker part   ${stats(worker)}\n  round trip    ${stats(trip)}\n  main-thread   ${stats(mainPart)} (round trip minus worker part)`);
  }
  client.terminate();
}

void main();
