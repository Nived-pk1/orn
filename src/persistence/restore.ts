/**
 * Restore a snapshot into the live store (docs/PERSISTENCE.md §9): read → migrate (if older, through the injected
 * runner) → strict L1 parse → `pre_restore` snapshot of what is live → `replaceState` (validated like a commit,
 * history cleared). Every failure is a value and changes nothing: the live state, its history and the stored
 * snapshots stay as they were (a `pre_restore` snapshot made for a restore that then fails is removed again).
 *
 * The restored state reaches IndexedDB the way every ChangeSet does: `replaceState` notifies the store's
 * subscribers with a `replace` ChangeSet and the write queue persists it; the caller may `flush()` to wait.
 */
import type { CanonicalStore } from '@/core/commands/contracts';
import { documentToState } from '@/core/dataset';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { DatasetDocumentSchema } from '@/core/schema';
import type { PersistenceAdapter, RestoreSnapshotResult, SnapshotSummary } from './contracts';

const MAX_REPORTED_ISSUES = 20;
/** The live state may change while the pre-restore snapshot is written; take it again a bounded number of times. */
const MAX_PRE_RESTORE_ATTEMPTS = 3;

export interface RestoreSnapshotOptions {
  readonly id: string;
  readonly snapshots: Pick<PersistenceAdapter, 'createSnapshot' | 'readSnapshot' | 'deleteSnapshot'>;
  readonly runner: MigrationRunner;
  readonly store: Pick<CanonicalStore, 'getState' | 'getRevision' | 'isReadOnly' | 'replaceState'>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function restoreSnapshot(options: RestoreSnapshotOptions): Promise<RestoreSnapshotResult> {
  const { id, snapshots, runner, store } = options;
  if (store.isReadOnly()) return { ok: false, code: 'READ_ONLY', message: 'this tab is not the writer; nothing was restored' };

  const read = await snapshots.readSnapshot(id);
  if (!read.ok) return { ok: false, code: read.code, message: read.message };

  const migrated = runner.run(read.doc);
  if (!migrated.ok) return { ok: false, code: 'MIGRATION_FAILED', message: migrated.message, migration: migrated };

  const parsed = DatasetDocumentSchema.safeParse(migrated.doc);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, MAX_REPORTED_ISSUES).map((i) => ({ path: i.path.map(String).join('.'), message: i.message }));
    return { ok: false, code: 'INVALID', message: `snapshot ${id} does not pass validation (${parsed.error.issues.length} issue(s))`, issues };
  }
  const restored = documentToState(parsed.data);
  if (!restored.ok) {
    const issues = restored.duplicates.slice(0, MAX_REPORTED_ISSUES).map((d) => ({ path: `records.${d.kind}`, message: `duplicate ID ${d.id}` }));
    return { ok: false, code: 'INVALID', message: `snapshot ${id} repeats record IDs`, issues };
  }

  let preRestore: SnapshotSummary | undefined;
  for (let attempt = 0; preRestore === undefined && attempt < MAX_PRE_RESTORE_ATTEMPTS; attempt += 1) {
    const revision = store.getRevision();
    let taken: SnapshotSummary;
    try {
      taken = await snapshots.createSnapshot('pre_restore', store.getState(), revision, `before restoring snapshot ${id}`);
    } catch (error) {
      return { ok: false, code: 'SNAPSHOT_FAILED', message: `the pre_restore snapshot could not be written, so nothing was restored (${messageOf(error)})` };
    }
    if (store.getRevision() === revision) preRestore = taken;
    else await snapshots.deleteSnapshot(taken.id).catch(() => undefined);
  }
  if (preRestore === undefined) {
    return { ok: false, code: 'SNAPSHOT_FAILED', message: 'the live data kept changing while the pre_restore snapshot was written; nothing was restored, try again' };
  }

  const result = store.replaceState(restored.state, 'restore');
  if (!result.ok) {
    const removed = await snapshots.deleteSnapshot(preRestore.id).then(() => true, () => false);
    return {
      ok: false,
      code: 'REJECTED',
      message: `the store refused the restored state (${result.error.code}: ${result.error.message})${removed ? '' : `; the unused pre_restore snapshot ${preRestore.id} could not be removed`}`,
      error: result.error,
    };
  }
  return { ok: true, preRestore, migrationSteps: migrated.steps, revision: result.changes.revision };
}
