/**
 * Step 5.10b, Part 3b decision 5 (informal; run alone; REPORTED): where the worker-side `loadReplica` time goes, by the same calls
 * `src/workers/compute/replica.ts` makes (`freeze`, `indexEngine.build`, `validator.validateAll`, `commitFindings`, `recordCountsOf`),
 * timed one by one in Node on the design-tier dense state with the 60 navigator anchors (the state the browser boot sends), plus the
 * structured clone of the request and of the answer (`v8.serialize` / `deserialize` as in the benches).
 *   npx tsx tests/measure/load-replica-split.measure.ts [runs]
 */
import { deserialize, serialize } from 'node:v8';
import { freeze } from 'immer';
import { recordCountsOf } from '@/core/commands';
import { indexEngine } from '@/core/indexes/full';
import { RECORD_KINDS, type CanonicalState, type RecordRef } from '@/core/schema';
import { commitFindings, createFindingStore, validator } from '@/core/validation';
import { withNavigatorAnchors, tierState } from '@/test-support/perf-kit';

const runs = Number(process.argv[2] ?? 5);
const state = withNavigatorAnchors(tierState('design', 'dense', 1)) as CanonicalState;
const refsOf = (s: CanonicalState): RecordRef[] => RECORD_KINDS.flatMap((kind) => Object.keys(s.records[kind]).map((id) => ({ kind, id }) as RecordRef));
const bytes = serialize({ state, revision: 0 });
const total = RECORD_KINDS.reduce((n, k) => n + Object.keys(state.records[k]).length, 0);
console.log(`records ${total}, request ${(bytes.length / 1e6).toFixed(1)} MB (v8 serialisation)`);

const rows: Record<string, number[]> = {};
const time = <T>(name: string, fn: () => T): T => {
  const t = performance.now();
  const out = fn();
  (rows[name] ??= []).push(performance.now() - t);
  return out;
};
for (let i = 0; i < runs; i += 1) {
  const received = time('1 receive: deserialise the request', () => deserialize(bytes) as { state: CanonicalState });
  const frozen = time('2 immer freeze(state, true) (deep)', () => freeze(received.state, true));
  const indexes = time('3 indexEngine.build', () => indexEngine.build(frozen, 0));
  const found = time('4 validator.validateAll', () => validator.validateAll(frozen, indexes));
  const store = createFindingStore();
  time('5 commitFindings into the store', () => commitFindings(store, refsOf(frozen), found));
  const counts = time('6 recordCountsOf', () => recordCountsOf(frozen));
  time('7 serialise the answer (findings)', () => serialize({ findings: found, revision: 0, recordCounts: counts }));
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] as number;
let sum = 0;
for (const [name, v] of Object.entries(rows)) {
  sum += med(v);
  console.log(`${name.padEnd(42)} first ${(v[0] ?? 0).toFixed(0).padStart(4)} ms   median ${med(v).toFixed(0).padStart(4)} ms   all ${v.map((x) => x.toFixed(0)).join(' ')}`);
}
console.log(`sum of medians ${sum.toFixed(0)} ms`);
