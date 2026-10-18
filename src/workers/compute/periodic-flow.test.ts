/**
 * The periodic snapshot flow (step 6.1b part 4) on fakes: it starts only when the policy says so, one at a time, never in a read-only store; the
 * bytes come from the worker's replica, and every outcome is a value: stored, stale (nothing stored, still due) or failed.
 */
import { describe, expect, it } from 'vitest';
import type { RpcResult, SnapshotBuildAnswer } from '@/workers/rpc/contracts';
import type { ReplicaStatus } from './sync';
import { startComputePeriodicSnapshots, type PeriodicDue, type PeriodicOutcome } from './periodic-flow';

type Built = RpcResult<SnapshotBuildAnswer>;

function rig(options: { readOnly?: boolean; due?: () => boolean; build?: () => Built; store?: Parameters<typeof startComputePeriodicSnapshots>[0]['snapshots']['storeSnapshotBytes']; down?: boolean; noReplica?: boolean } = {}) {
  let revision = 10;
  const listeners = new Set<() => void>();
  const outcomes: PeriodicOutcome[] = [];
  const taken: number[] = [];
  const stored: number[] = [];
  const policy: PeriodicDue = { noteChange: options.due ?? (() => true), markSnapshotTaken: () => void taken.push(revision) };
  const flow = startComputePeriodicSnapshots({
    store: { subscribe: (listener) => (listeners.add(listener as () => void), () => listeners.delete(listener as () => void)), getRevision: () => revision, isReadOnly: () => options.readOnly === true },
    policy,
    replica: () =>
      options.noReplica === true
        ? undefined
        : {
            settled: async () => ({ state: options.down === true ? 'down' : 'in_sync', reason: 'gone' }) as ReplicaStatus,
            client: { snapshotBuild: async () => (options.build?.() ?? { ok: true, value: { ok: true, bytes: new Uint8Array([1]), revision, reason: 'periodic', schemaVersion: 3 } }) as never },
          },
    snapshots: {
      storeSnapshotBytes:
        options.store ??
        (async (input) => {
          stored.push(input.revision);
          return { ok: true, summary: { id: 'snp_1', createdAt: '2026-10-18T10:00:00.000Z' } };
        }),
    },
    ids: { now: () => '2026-10-18T10:00:00.000Z' },
    generator: { app: 'test', version: '0' },
    onOutcome: (outcome) => void outcomes.push(outcome),
  });
  const change = (): void => {
    revision += 1;
    for (const listener of [...listeners]) listener();
  };
  return { flow, change, outcomes, taken, stored };
}

describe('startComputePeriodicSnapshots', () => {
  it('stores the bytes of the revision it was due at, and tells the policy', async () => {
    const r = rig();
    r.change();
    await r.flow.whenIdle();
    expect(r.outcomes).toEqual([{ kind: 'stored', id: 'snp_1', createdAt: '2026-10-18T10:00:00.000Z', revision: 11 }]);
    expect(r.stored).toEqual([11]);
    expect(r.taken).toHaveLength(1);
  });

  it('asks nothing while the policy says not yet, nor in a read-only store, nor after stop', async () => {
    const notYet = rig({ due: () => false });
    notYet.change();
    await notYet.flow.whenIdle();
    const readOnly = rig({ readOnly: true });
    readOnly.change();
    await readOnly.flow.whenIdle();
    const stopped = rig();
    stopped.flow.stop();
    stopped.change();
    await stopped.flow.whenIdle();
    for (const r of [notYet, readOnly, stopped]) expect(r.outcomes).toEqual([]);
  });

  it('one at a time: changes while one is being made start no second', async () => {
    const r = rig();
    r.change();
    r.change();
    r.change();
    await r.flow.whenIdle();
    expect(r.outcomes).toHaveLength(1);
  });

  it('the replica refusing the revision, or the adapter refusing it, is stale: nothing stored, the policy not told, the next change tries again', async () => {
    let answer: Built = { ok: true, value: { ok: false, code: 'REPLICA_STALE', have: 9 } } as never;
    const r = rig({ build: () => answer });
    r.change();
    await r.flow.whenIdle();
    expect(r.outcomes[0]).toMatchObject({ kind: 'stale' });
    expect(r.stored).toEqual([]);
    expect(r.taken).toEqual([]);
    answer = undefined as never; // the default build: bytes
    const adapterRefuses = rig({ store: async () => ({ ok: false, code: 'STALE_REVISION', message: 'moved on' }) });
    adapterRefuses.change();
    await adapterRefuses.flow.whenIdle();
    expect(adapterRefuses.outcomes[0]).toMatchObject({ kind: 'stale', message: 'moved on' });
    expect(adapterRefuses.taken).toEqual([]);
    adapterRefuses.change();
    await adapterRefuses.flow.whenIdle();
    expect(adapterRefuses.outcomes).toHaveLength(2); // the next change tried again
  });

  it('a build that fails, bytes that are refused, a worker that is down or gone, a throwing port: failed, in words, nothing stored', async () => {
    const cases = [
      rig({ build: () => ({ ok: false, error: { code: 'TIMEOUT', message: 'slow' } }) as never }),
      rig({ build: () => ({ ok: true, value: { ok: false, code: 'SERIALIZE_FAILED', message: 'bad record' } }) as never }),
      rig({ store: async () => ({ ok: false, code: 'BAD_BYTES', message: 'not zlib' }) }),
      rig({ down: true }),
      rig({ noReplica: true }),
      rig({ store: async () => Promise.reject(new Error('disk full')) }),
    ];
    for (const r of cases) {
      r.change();
      await r.flow.whenIdle();
      expect(r.outcomes[0]?.kind).toBe('failed');
      expect(r.taken).toEqual([]);
    }
    expect(cases.map((r) => (r.outcomes[0] as { reason: string }).reason)).toEqual([
      'the snapshot could not be built (TIMEOUT: slow)',
      'the snapshot could not be built (bad record)',
      'the snapshot was refused (not zlib)',
      'the compute worker is down (gone)',
      'the compute worker is not available',
      'Error: disk full',
    ]);
  });
});
