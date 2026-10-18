/**
 * Periodic snapshots built by the compute worker (step 6.1b part 4, openItem 119, docs/PERSISTENCE.md §9). The policy that decides WHEN is
 * unchanged (`createPeriodicPolicy`: 30 minutes of activity or 200 revisions, injected clock); this is the flow that does it, in the WRITER tab
 * only (the caller starts it only there): when a ChangeSet makes a snapshot due and none is being made,
 *
 *   wait for the replica to catch up -> `snapshotBuild('periodic', revision)` (the worker's replica; the main thread builds nothing) ->
 *   the persistence bytes entry point (`storeSnapshotBytes`, which prunes to the newest five periodic ones in the same transaction).
 *
 * Every outcome is a value passed to `onOutcome`: `stored`; `stale` (the data moved on while the bytes were built, so the replica or the
 * adapter refused the revision: nothing is stored, the policy stays due, the NEXT ChangeSet tries again: no timer, no loop); `failed`
 * (anything else: also nothing stored and still due, and said in words). It knows only ports: a worker directory never imports persistence.
 */
import type { CanonicalStore } from '@/core/commands/contracts';
import type { DocumentGenerator, RpcClient, ComputeWorkerApi } from '@/workers/rpc/contracts';
import type { ReplicaStatus } from './sync';

/** The policy, as `src/persistence/snapshot-policy.ts` exposes it (a structural copy: this directory never imports persistence). */
export interface PeriodicDue {
  noteChange(): boolean;
  markSnapshotTaken(): void;
}

export interface PeriodicSnapshotsPort {
  storeSnapshotBytes(input: {
    readonly bytes: Uint8Array;
    readonly reason: 'periodic';
    readonly revision: number;
    readonly schemaVersion: number;
  }): Promise<{ readonly ok: true; readonly summary: { readonly id: string; readonly createdAt: string } } | { readonly ok: false; readonly code: 'STALE_REVISION' | 'BAD_BYTES'; readonly message: string }>;
}

export type PeriodicOutcome =
  | { readonly kind: 'stored'; readonly id: string; readonly createdAt: string; readonly revision: number }
  | { readonly kind: 'stale'; readonly revision: number; readonly message: string }
  | { readonly kind: 'failed'; readonly revision: number; readonly reason: string };

export interface PeriodicFlowDeps {
  readonly store: Pick<CanonicalStore, 'subscribe' | 'getRevision' | 'isReadOnly'>;
  readonly policy: PeriodicDue;
  /** The replica sync, when there is one: its `settled()` and the client that builds. Absent (the worker is gone): the attempt fails in words. */
  readonly replica: () => { readonly settled: () => Promise<ReplicaStatus>; readonly client: Pick<RpcClient<ComputeWorkerApi>, 'snapshotBuild'> } | undefined;
  readonly snapshots: PeriodicSnapshotsPort;
  readonly ids: { now(): string };
  readonly generator: DocumentGenerator;
  readonly onOutcome: (outcome: PeriodicOutcome) => void;
}

export interface PeriodicFlow {
  stop(): void;
  /** Resolves when no snapshot is being made. */
  whenIdle(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function startComputePeriodicSnapshots(deps: PeriodicFlowDeps): PeriodicFlow {
  let running: Promise<void> | undefined;
  let stopped = false;

  async function attempt(): Promise<PeriodicOutcome> {
    const revision = deps.store.getRevision();
    const replica = deps.replica();
    if (replica === undefined) return { kind: 'failed', revision, reason: 'the compute worker is not available' };
    const settled = await replica.settled();
    if (settled.state === 'down') return { kind: 'failed', revision, reason: `the compute worker is down (${settled.reason})` };
    if (deps.store.getRevision() !== revision) return { kind: 'stale', revision, message: 'the data changed while the replica caught up' };
    const built = await replica.client.snapshotBuild({ revision, reason: 'periodic', exportedAt: deps.ids.now(), generator: deps.generator });
    if (!built.ok) return { kind: 'failed', revision, reason: `the snapshot could not be built (${built.error.code}: ${built.error.message})` };
    const bytes = built.value;
    if (!bytes.ok) return bytes.code === 'REPLICA_STALE' ? { kind: 'stale', revision, message: `the replica is at revision ${bytes.have}` } : { kind: 'failed', revision, reason: `the snapshot could not be built (${bytes.message})` };
    const stored = await deps.snapshots.storeSnapshotBytes({ bytes: bytes.bytes, reason: 'periodic', revision, schemaVersion: bytes.schemaVersion });
    if (!stored.ok) return stored.code === 'STALE_REVISION' ? { kind: 'stale', revision, message: stored.message } : { kind: 'failed', revision, reason: `the snapshot was refused (${stored.message})` };
    return { kind: 'stored', id: stored.summary.id, createdAt: stored.summary.createdAt, revision };
  }

  const unsubscribe = deps.store.subscribe(() => {
    if (stopped || deps.store.isReadOnly() || !deps.policy.noteChange() || running !== undefined) return;
    running = attempt()
      .catch((error: unknown): PeriodicOutcome => ({ kind: 'failed', revision: deps.store.getRevision(), reason: messageOf(error) }))
      .then((outcome) => {
        if (outcome.kind === 'stored') deps.policy.markSnapshotTaken();
        if (!stopped) deps.onOutcome(outcome);
      })
      .finally(() => {
        running = undefined;
      });
  });
  return {
    stop() {
      stopped = true;
      unsubscribe();
    },
    whenIdle: async () => void (await running),
  };
}
