/**
 * Snapshots at the design tier (docs/IMPLEMENTATION_PLAN.md step 3.2; PERFORMANCE_ARCHITECTURE.md §2 has no row, so
 * these are informal). Snapshot building and restore are plain functions hosted by the compute worker from Phase 4;
 * they run on the main thread until then, so the numbers are what a Phase 3 caller would wait for. No IndexedDB:
 *  - build: state → serialise (L1 through the strict schema) → compress;
 *  - decode + migrate + L1 parse: what a restore does before it touches the store;
 *  - restore, whole: `restoreSnapshot` over an in-memory port, including the `pre_restore` build and
 *    `replaceState` (validateAll L1–L3 and incremental indexes). It alternates two snapshots so every restore
 *    replaces different content.
 */
import { bench, describe } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import { documentToState } from '@/core/dataset';
import { DatasetDocumentSchema, type CanonicalState } from '@/core/schema';
import type { PersistenceAdapter, SnapshotReadResult, SnapshotSummary } from '@/persistence/contracts';
import { restoreSnapshot } from '@/persistence/restore';
import { buildSnapshot, decodeSnapshot, type BuiltSnapshot } from '@/persistence/snapshot-codec';
import { SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';

const GENERATOR = { app: 'bench', version: '0' } as const;
const first = tierState('design', 'dense', 1);
const second = tierState('design', 'dense', 2);

function build(id: string, state: CanonicalState, reason: SnapshotSummary['reason'] = 'manual'): BuiltSnapshot {
  const result = buildSnapshot({ id, createdAt: '2026-09-28T10:00:00.000Z', reason, state, revision: 1, generator: GENERATOR });
  if (!result.ok) throw new Error('bench setup: snapshot does not serialise');
  return result.built;
}

const snapshots = new Map<string, BuiltSnapshot>([
  ['snp_first', build('snp_first', first)],
  ['snp_second', build('snp_second', second)],
]);
const identity = { target: 1, run: (doc: never) => ({ ok: true as const, doc, steps: [] }) };

describe('snapshot (design tier, dense)', () => {
  bench('build: serialise + compress', () => void build('snp_bench', first), SLOW_BENCH_OPTIONS);

  const bytes = (snapshots.get('snp_first') as BuiltSnapshot).bytes;
  bench(
    'restore without the store: decode + migrate + L1 parse + state',
    () => {
      const decoded = decodeSnapshot(bytes);
      if (!decoded.ok) throw new Error(decoded.message);
      const migrated = identity.run(decoded.doc as never) as { doc: unknown };
      const parsed = DatasetDocumentSchema.parse(migrated.doc);
      if (!documentToState(parsed).ok) throw new Error('duplicate IDs');
    },
    SLOW_BENCH_OPTIONS,
  );
});

describe('snapshot restore (design tier, dense, whole)', () => {
  const store = createCanonicalStore({ initial: first, validateInitial: false });
  const port: Pick<PersistenceAdapter, 'createSnapshot' | 'readSnapshot' | 'deleteSnapshot'> = {
    async createSnapshot(reason, state, revision) {
      return { ...build('snp_pre', state, reason).summary, revision };
    },
    async readSnapshot(id): Promise<SnapshotReadResult> {
      const stored = snapshots.get(id) as BuiltSnapshot;
      const decoded = decodeSnapshot(stored.bytes);
      if (!decoded.ok) return { ok: false, code: 'CORRUPT', message: decoded.message };
      return { ok: true, summary: stored.summary, doc: decoded.doc };
    },
    async deleteSnapshot() {},
  };
  let n = 0;
  bench(
    'restoreSnapshot: decode, L1, pre_restore build, replaceState (L1-L3)',
    async () => {
      n += 1;
      const result = await restoreSnapshot({ id: n % 2 === 1 ? 'snp_second' : 'snp_first', snapshots: port, runner: identity, store });
      if (!result.ok) throw new Error(`restore failed: ${result.code} ${result.message}`);
    },
    SLOW_BENCH_OPTIONS,
  );
});
