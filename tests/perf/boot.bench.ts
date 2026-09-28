/**
 * Boot load at the design tier (docs/IMPLEMENTATION_PLAN.md step 3.3; PERFORMANCE_ARCHITECTURE.md §2's cold-boot
 * budget is judged at Gate E in a real browser, so these are informal). The parts are reported separately so our own
 * work is not confused with fake-indexeddb, whose reads and writes cost far more than a real IndexedDB's:
 *  - bulk read: `readCommitted` on fake-indexeddb. NOT our code.
 *  - per-record L1 + state: `assembleState` over the rows (one `parseRecord` per row, then the frozen state).
 *  - index build: `coreIndexEngine.build`.
 *  - validateAll: L1-L3 over the state (boot returns the findings so the store need not).
 *  - whole `open()`: a new adapter over the same database each time, everything above plus the marker writes and
 *    checks, INCLUDING the fake-indexeddb read.
 */
import { bench, describe } from 'vitest';
import { assembleState } from '@/persistence/boot-load';
import { coreIndexEngine } from '@/core/indexes/engine';
import { DatasetMetaSchema } from '@/core/schema';
import { validator } from '@/core/validation';
import { freshAdapter, reopen, seedChangeSet } from '@/test-support/persistence-kit';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';

const state = tierState('design', 'dense');
let current = freshAdapter({ initialRevision: 0 });
await current.adapter.writeChanges(seedChangeSet(state, 1), state);
current = reopen(current);
const committed = await current.adapter.readCommitted();
const datasetMeta = DatasetMetaSchema.parse(committed.meta.datasetMeta);
const loaded = assembleState(committed.rows, datasetMeta, '2026-09-28T10:00:00.000Z');
if (loaded.rejected.length > 0) throw new Error('bench setup: the generated rows must all pass L1');

describe('boot load (design tier, dense)', () => {
  bench('bulk read from fake-indexeddb (readCommitted; not our code)', async () => void (await current.adapter.readCommitted()), SLOW_BENCH_OPTIONS);
  bench('per-record L1 + state (assembleState over the rows)', () => void assembleState(committed.rows, datasetMeta, '2026-09-28T10:00:00.000Z'), SLOW_BENCH_OPTIONS);
  bench('index build (coreIndexEngine.build)', () => void coreIndexEngine.build(loaded.state, 1), SLOW_BENCH_OPTIONS);
  const indexes = coreIndexEngine.build(loaded.state, 1);
  bench('validateAll (L1-L3, findings returned to the app)', () => void validator.validateAll(loaded.state, indexes), SLOW_BENCH_OPTIONS);
  bench(
    'whole open(): read + L1 + state + indexes + validateAll + checks + markers (includes the fake-indexeddb read)',
    async () => {
      current = reopen(current);
      const result = await current.adapter.open();
      if (result.mode !== 'read_write') throw new Error('bench: boot did not open read-write');
    },
    SLOW_BENCH_OPTIONS,
  );
});
