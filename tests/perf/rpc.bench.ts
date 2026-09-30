/**
 * RPC round trip over a real `worker_threads` worker (docs/IMPLEMENTATION_PLAN.md step 4.1; PERFORMANCE_ARCHITECTURE.md
 * §2 has no row for it, so these are informal). The fixture worker echoes its param, so one call is: structured clone
 * out, host dispatch, structured clone back, client bookkeeping. Three payloads: a small request, a ChangeSet-sized one
 * (a few KB of patches, what the replica sync sends per commit) and about 1 MB (10,000 small records).
 * Node's worker_threads costs are close to, not equal to, a browser Worker's: the numbers are the library's overhead.
 */
import { afterAll, bench, describe } from 'vitest';
import { spawnTestWorker } from '@/test-support/rpc-node-port';
import { TEST_SPECS, type TestApi } from '@/test-support/rpc-test-api';
import { createRpcClient } from '@/workers/rpc';
import { FAST_BENCH_OPTIONS } from '@/test-support/perf-kit';

const client = createRpcClient<TestApi>({ factory: spawnTestWorker, specs: TEST_SPECS });
// Thread start-up (tsx) is not part of any sample: the first call is answered before the benches run.
await client.add({ a: 1, b: 1 });

const record = (i: number): Record<string, unknown> => ({
  kind: 'species',
  id: `spc_${String(i).padStart(26, '0')}`,
  names: { canonical: `compound ${i}`, aliases: ['alias one', 'alias two'] },
  notes: 'x'.repeat(40),
});
const changeSet = {
  revision: 1234,
  label: 'Edit species',
  cause: 'command',
  created: [],
  updated: [{ kind: 'species', id: 'spc_00000000000000000000000001' }],
  deleted: [],
  patches: Array.from({ length: 4 }, (_, i) => ({ op: 'replace', path: ['records', 'species', 'spc_00000000000000000000000001', `field${i}`], value: 'y'.repeat(900) })),
  inversePatches: Array.from({ length: 4 }, (_, i) => ({ op: 'replace', path: ['records', 'species', 'spc_00000000000000000000000001', `field${i}`], value: 'z'.repeat(900) })),
};
const oneMegabyte = Array.from({ length: 10_000 }, (_, i) => record(i));

async function roundTrip(call: () => Promise<{ ok: boolean }>): Promise<void> {
  const result = await call();
  if (!result.ok) throw new Error('rpc bench: the call failed');
}

afterAll(() => client.terminate());

describe('rpc round trip (worker_threads)', () => {
  bench('small payload (add)', () => roundTrip(() => client.add({ a: 1, b: 2 })), FAST_BENCH_OPTIONS);
  bench('ChangeSet-sized payload (about 8 KB echoed)', () => roundTrip(() => client.echo({ value: changeSet })), FAST_BENCH_OPTIONS);
  bench('about 1 MB payload echoed', () => roundTrip(() => client.echo({ value: oneMegabyte })), FAST_BENCH_OPTIONS);
});
