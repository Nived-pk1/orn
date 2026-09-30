/**
 * Restoring a snapshot with the compute worker (step 4.2d, Phase 4 contract decisions Q1 and observation 3). The main-thread
 * side, ports only (a worker directory never imports persistence):
 *
 *   read the stored bytes -> settle the replica sync -> `snapshotDecode` (worker: decode, migrate, strict L1, indexes and
 *   `validateAll` once, held as the PENDING state) -> `pre_restore` snapshot of the live state (`snapshotBuild` +
 *   `storeSnapshotBytes`) -> expect the adoption -> ONE `store.replaceState(state, 'restore', precomputed)`.
 *
 * It keeps the rules of the in-process `restoreSnapshot` (src/persistence/restore.ts): every failure is a value with the same
 * code and changes nothing (live state, history, stored snapshots, the replica: no pending state is left), a `pre_restore`
 * snapshot made for a restore that then fails is removed again, and the snapshot is taken again, at most 3 times, when the
 * live data changed while it was written. The pending state is prepared for one revision, so a changed revision means the
 * decode is done again as well. Nothing here decides anything about chemistry.
 */
import type { CommandError, CanonicalStore } from '@/core/commands';
import type { IdFactory } from '@/core/dataset';
import type { MigrationError, MigrationStepReport } from '@/core/migrations/contracts';
import type { SnapshotDecodeAnswer } from '@/workers/rpc/contracts';
import type { ReplicaSync } from './sync';

/** The fields of a stored snapshot's summary this flow reads (the adapter's `SnapshotSummary` satisfies it). */
export interface SnapshotSummaryLike {
  readonly id: string;
  readonly createdAt: string;
  readonly reason: string;
  readonly revision: number;
  readonly schemaVersion: number;
  readonly byteSize: number;
  readonly note?: string;
}

/** What the flow needs of the persistence adapter: `readSnapshotBytes`, `storeSnapshotBytes` and `deleteSnapshot` satisfy it structurally. */
export interface RestoreSnapshotsPort {
  readSnapshotBytes(id: string): Promise<
    { readonly ok: true; readonly summary: SnapshotSummaryLike; readonly bytes: Uint8Array } | { readonly ok: false; readonly code: 'NOT_FOUND' | 'CORRUPT'; readonly message: string }
  >;
  storeSnapshotBytes(input: {
    readonly bytes: Uint8Array;
    readonly reason: 'pre_restore';
    readonly revision: number;
    readonly schemaVersion: number;
    readonly note?: string;
  }): Promise<{ readonly ok: true; readonly summary: SnapshotSummaryLike } | { readonly ok: false; readonly code: 'STALE_REVISION' | 'BAD_BYTES'; readonly message: string }>;
  deleteSnapshot(id: string): Promise<void>;
}

/** The persistence adapter's `RestoreSnapshotResult`, structurally (tests/types/restore-result.test.ts keeps them equal). */
export type ComputeRestoreResult =
  | { readonly ok: true; readonly preRestore: SnapshotSummaryLike; readonly migrationSteps: readonly MigrationStepReport[]; readonly revision: number }
  | {
      readonly ok: false;
      readonly code: 'READ_ONLY' | 'NOT_FOUND' | 'CORRUPT' | 'MIGRATION_FAILED' | 'INVALID' | 'REJECTED' | 'SNAPSHOT_FAILED';
      readonly message: string;
      readonly migration?: MigrationError;
      readonly issues?: readonly { readonly path: string; readonly message: string }[];
      readonly error?: CommandError;
    };

export interface ComputeRestoreDeps {
  readonly sync: Pick<ReplicaSync, 'client' | 'settled' | 'expectAdoption' | 'clearAdoption'>;
  readonly store: Pick<CanonicalStore, 'getRevision' | 'isReadOnly' | 'replaceState'>;
  readonly snapshots: RestoreSnapshotsPort;
  /** The `pre_restore` snapshot document's `exportedAt` comes from main's injected clock. */
  readonly ids: Pick<IdFactory, 'now'>;
}

export interface ComputeRestore {
  restore(id: string): Promise<ComputeRestoreResult>;
}

/** The live data may change while the pre-restore snapshot is written; take it again a bounded number of times (restore.ts). */
export const MAX_PRE_RESTORE_ATTEMPTS = 3;

type Failure = Extract<ComputeRestoreResult, { ok: false }>;
const failure = (code: Failure['code'], message: string, extra: Partial<Omit<Failure, 'ok' | 'code' | 'message'>> = {}): Failure => ({ ok: false, code, message, ...extra });
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

type Decoded = Extract<SnapshotDecodeAnswer, { ok: true }> & { readonly baseRevision: number };

export function createComputeRestore(deps: ComputeRestoreDeps): ComputeRestore {
  const { sync, store, snapshots } = deps;
  const client = sync.client;

  /** After a refusal past the first decode: the worker forgets the pending state, the sync forgets the adoption. */
  async function abandon(snapshotId?: string): Promise<void> {
    sync.clearAdoption();
    if (snapshotId !== undefined) await snapshots.deleteSnapshot(snapshotId).catch(() => undefined);
    await client.dropPending({});
  }

  async function run(id: string): Promise<ComputeRestoreResult> {
    if (store.isReadOnly()) return failure('READ_ONLY', 'this tab is not the writer; nothing was restored');

    const read = await snapshots.readSnapshotBytes(id);
    if (!read.ok) return failure(read.code, read.message);

    let decoded: Decoded | undefined;
    let preRestore: SnapshotSummaryLike | undefined;
    for (let attempt = 0; preRestore === undefined && attempt < MAX_PRE_RESTORE_ATTEMPTS; attempt += 1) {
      // The replica must have caught up with every commit so far, or the worker would call the revision stale.
      const caught = await sync.settled();
      if (caught.state === 'down') return abandonWith(failure('REJECTED', `the compute worker is down (${caught.reason}); nothing was restored`));
      const revision = store.getRevision();

      if (decoded === undefined || decoded.baseRevision !== revision) {
        const answer = await client.snapshotDecode({ bytes: read.bytes, id, schemaVersion: read.summary.schemaVersion, baseRevision: revision });
        if (!answer.ok) return abandonWith(failure('REJECTED', `the compute worker could not decode the snapshot (${answer.error.code}: ${answer.error.message}); nothing was restored`));
        const value = answer.value;
        if (!value.ok) {
          if (value.code === 'REPLICA_STALE') continue; // a commit landed after `settled`: settle again
          if (value.code === 'BUSY') return failure('REJECTED', `${value.message}; nothing was restored`);
          return failure(value.code, value.message, { ...(value.migration === undefined ? {} : { migration: value.migration }), ...(value.issues === undefined ? {} : { issues: value.issues }) });
        }
        decoded = { ...value, baseRevision: revision };
      }

      const built = await client.snapshotBuild({ revision, reason: 'pre_restore', exportedAt: deps.ids.now() });
      if (!built.ok) return abandonWith(failure('SNAPSHOT_FAILED', `the pre_restore snapshot could not be written, so nothing was restored (${built.error.code}: ${built.error.message})`));
      if (!built.value.ok) {
        if (built.value.code === 'REPLICA_STALE') continue;
        return abandonWith(failure('SNAPSHOT_FAILED', `the pre_restore snapshot could not be written, so nothing was restored (${built.value.message})`));
      }
      let stored: Awaited<ReturnType<RestoreSnapshotsPort['storeSnapshotBytes']>>;
      try {
        stored = await snapshots.storeSnapshotBytes({
          bytes: built.value.bytes,
          reason: 'pre_restore',
          revision,
          schemaVersion: built.value.schemaVersion,
          note: `before restoring snapshot ${id}`,
        });
      } catch (error) {
        return abandonWith(failure('SNAPSHOT_FAILED', `the pre_restore snapshot could not be written, so nothing was restored (${messageOf(error)})`));
      }
      if (!stored.ok) {
        if (stored.code === 'STALE_REVISION') continue; // the live revision moved: take it again
        return abandonWith(failure('SNAPSHOT_FAILED', `the pre_restore snapshot was refused, so nothing was restored (${stored.message})`));
      }
      if (store.getRevision() === revision) preRestore = stored.summary;
      else await snapshots.deleteSnapshot(stored.summary.id).catch(() => undefined);
    }
    if (preRestore === undefined || decoded === undefined) {
      return abandonWith(failure('SNAPSHOT_FAILED', 'the live data kept changing while the pre_restore snapshot was written; nothing was restored, try again'));
    }

    let committed: ReturnType<typeof store.replaceState>;
    try {
      sync.expectAdoption(decoded.baseRevision + 1);
      committed = store.replaceState(decoded.state, 'restore', decoded.precomputed);
    } catch (error) {
      await abandon(preRestore.id);
      return failure('REJECTED', `the restore could not be applied (${messageOf(error)}); nothing was changed`);
    }
    if (!committed.ok) {
      sync.clearAdoption();
      const removed = await snapshots.deleteSnapshot(preRestore.id).then(() => true, () => false);
      await client.dropPending({});
      return failure(
        'REJECTED',
        `the store refused the restored state (${committed.error.code}: ${committed.error.message})${removed ? '' : `; the unused pre_restore snapshot ${preRestore.id} could not be removed`}`,
        { error: committed.error },
      );
    }
    return { ok: true, preRestore, migrationSteps: decoded.steps, revision: committed.changes.revision };
  }

  /** A failure after the worker may hold a pending state: forget it, then answer. */
  async function abandonWith(result: Failure): Promise<Failure> {
    await abandon();
    return result;
  }

  return { restore: run };
}
