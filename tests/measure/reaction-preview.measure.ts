/**
 * Step 6.3b, part 1 (informal; run once, alone; REPORTED): building the equations of one reaction DRAFT (the preview's work) at the design
 * tier (hub_explosion state): the largest reaction of the dataset, in the replica's own code (no thread). Fact sheet: the builders take a
 * reaction record and read the state and indexes; nothing is written.
 * Run: `npx tsx tests/measure/reaction-preview.measure.ts [samples]`.
 */
import { performance } from 'node:perf_hooks';
import { fullEquationsOfReaction } from '@/core/graph';
import type { Reaction } from '@/core/schema';
import { designTierHubState } from '@/test-support/perf-kit';
import { createReplica } from '@/workers/compute/replica';

const stats = (xs: number[]): string => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `mean ${mean.toFixed(3)} ms, p99 ${(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.99))] as number).toFixed(3)} ms, min ${(sorted[0] as number).toFixed(3)}`;
};

const samples = Number(process.argv[2] ?? '300');
const state = designTierHubState();
const size = (r: Reaction): number => r.participants.length + r.stages.length + r.outcomes.length + r.conditionVariants.length + r.intermediates.length;
const largest = Object.values(state.records.reaction).reduce((a, b) => (size(b) > size(a) ? b : a)) as Reaction;
const replica = createReplica();
replica.load(state, 0);
const held = replica.snapshot();
console.log(`largest reaction ${largest.id}: ${largest.participants.length} participants, ${largest.stages.length} stages, ${largest.outcomes.length} outcomes, ${largest.conditionVariants.length} variants; ${Object.keys(state.records.species).length} species; node ${process.version}`);
const draft: Reaction = { ...largest, participants: largest.participants.map((p) => ({ ...p })) };
for (let i = 0; i < 30; i += 1) fullEquationsOfReaction(held.state, held.indexes, draft);
const times: number[] = [];
let groups = 0;
for (let i = 0; i < samples; i += 1) {
  const t = performance.now();
  groups = fullEquationsOfReaction(held.state, held.indexes, draft).length;
  times.push(performance.now() - t);
}
console.log(`${groups} equation(s) per build, ${samples} samples: ${stats(times)}`);

// the schema ceiling: 64 participants (reactants, reagents), 16 stages, 32 outcomes (all of them in one group)
const base = largest.participants[0] as Reaction['participants'][number];
const many: Reaction = {
  ...largest,
  participants: Array.from({ length: 64 }, (_, i) => ({ ...base, id: `prt_ceiling-${i}` as never, role: i < 8 ? 'reactant' : 'reagent' })),
  stages: Array.from({ length: 16 }, (_, i) => ({ ...(largest.stages[0] ?? { id: 'stg_x', kind: 'reaction', participantIds: [], parameters: { solventCharacter: [], activation: [], other: [], parsedFields: [], conditions: [] } }), id: `stg_ceiling-${i}` as never, participantIds: [] })) as never,
  outcomes: Array.from({ length: 32 }, (_, i) => ({ ...(largest.outcomes[0] as Reaction['outcomes'][number]), id: `out_ceiling-${i}` as never })),
};
for (let i = 0; i < 30; i += 1) fullEquationsOfReaction(held.state, held.indexes, many);
const ceiling: number[] = [];
for (let i = 0; i < samples; i += 1) {
  const t = performance.now();
  fullEquationsOfReaction(held.state, held.indexes, many);
  ceiling.push(performance.now() - t);
}
console.log(`schema ceiling (64 participants, 16 stages, 32 outcomes): ${stats(ceiling)}`);
