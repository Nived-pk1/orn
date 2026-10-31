/**
 * Restore and Undo import (step 5.1c): a stored snapshot back into the live store. Two paths, one pipeline: the compute worker
 * (`createComputeRestore`) or the in-process `restoreSnapshot` of Phase 3. Writer only (READ_ONLY as a value); one operation at a
 * time; answers only after `flush()`; a cancel before the commit changes nothing (the `pre_restore` snapshot made for it is removed
 * again by the flow, like for any refusal). Undo import is this flow applied to the `pre_import` snapshot of the newest batch.
 */
import { restoreSnapshot } from '@/persistence';
import { createComputeRestore, type ComputeRestore, type ComputeRestoreResult, type ReplicaSync } from '@/workers/compute';
import type { FlowDeps } from './flow-deps';
import { isRefusal, type Operation } from './flow-gate';
import { durabilityOf, guardStore } from './flow-ports';
import { cancelledRefusal, isRoute, readOnlyRefusal, routeOf } from './flow-route';
import type { FlowOptions, ImportLogLine, LastImport, RestoreAnswer, UndoRefusal } from './flow-types';

export interface RestoreService {
  restore(snapshotId: string, options?: FlowOptions): Promise<RestoreAnswer>;
  undo(options?: FlowOptions): Promise<RestoreAnswer | UndoRefusal>;
  lastImport(): Promise<LastImport | undefined>;
  importLog(): Promise<readonly ImportLogLine[]>;
}

export function createRestoreService(deps: FlowDeps): RestoreService {
  const { store, gate, router, ids } = deps;
  let activeOp: Operation | undefined;
  const snapshots = {
    readSnapshotBytes: (id: string) => deps.durable.readSnapshotBytes(id),
    readSnapshot: (id: string) => deps.durable.readSnapshot(id),
    createSnapshot(...args: Parameters<FlowDeps['durable']['createSnapshot']>) {
      activeOp?.stage('snapshot');
      return deps.durable.createSnapshot(...args);
    },
    storeSnapshotBytes(input: Parameters<FlowDeps['durable']['storeSnapshotBytes']>[0]) {
      activeOp?.stage('snapshot');
      return deps.durable.storeSnapshotBytes(input);
    },
    deleteSnapshot: (id: string) => deps.durable.deleteSnapshot(id),
  };

  let worker: { readonly sync: ReplicaSync; readonly flow: ComputeRestore } | undefined;
  const workerFlow = (sync: ReplicaSync): ComputeRestore => {
    if (worker?.sync !== sync) worker = { sync, flow: createComputeRestore({ sync, store: router.port, snapshots, ids, generator: deps.env.generator }) };
    return worker.flow;
  };

  async function restore(snapshotId: string, options?: FlowOptions): Promise<RestoreAnswer> {
    const refused = readOnlyRefusal(store, 'restore');
    if (refused !== undefined) return refused;
    if (options?.signal?.aborted === true) return cancelledRefusal();
    const route = routeOf(deps.replica, options);
    if (!isRoute(route)) return route;
    const op = gate.begin('restore', 'reading the snapshot');
    if (isRefusal(op)) return op;
    const guard = guardStore(store, options?.signal, () => op.stage('committing'));
    router.use(guard);
    activeOp = op;
    try {
      const result: ComputeRestoreResult =
        route.kind === 'worker'
          ? await workerFlow(route.sync).restore(snapshotId)
          : await restoreSnapshot({ id: snapshotId, snapshots, runner: deps.env.migrationRunner, store: router.port });
      if (!result.ok) return guard.cancelledAtCommit() ? cancelledRefusal() : result;
      op.stage('saving');
      const durable = await durabilityOf(deps.adapter, result.revision);
      const notes = [...deps.droppedNotes()];
      if (durable.sessionOnly) notes.push('nothing is saved in this session');
      return { ...result, ...durable, inProcess: route.kind === 'in_process', notes };
    } finally {
      activeOp = undefined;
      router.clear();
      op.end();
    }
  }

  return {
    restore,
    async lastImport() {
      const newest = (await deps.durable.listImportBatches())[0];
      if (newest === undefined) return undefined;
      const report = (typeof newest.report === 'object' && newest.report !== null && !Array.isArray(newest.report) ? newest.report : {}) as Record<string, unknown>;
      const text = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);
      return {
        batchId: newest.id,
        fileName: text(report.fileName, 'an earlier file'),
        appliedAt: text(report.appliedAt, newest.createdAt),
        format: text(report.format, 'unknown'),
        mode: text(report.mode, 'unknown'),
        undoable: typeof report.snapshotId === 'string',
      };
    },
    async importLog() {
      const rows = await deps.durable.listImportBatches();
      return rows.map((row) => {
        const report = (typeof row.report === 'object' && row.report !== null && !Array.isArray(row.report) ? row.report : {}) as Record<string, unknown>;
        return {
          id: row.id,
          fileName: typeof report.fileName === 'string' ? report.fileName : 'an earlier file',
          appliedAt: typeof report.appliedAt === 'string' ? report.appliedAt : row.createdAt,
        };
      });
    },
    async undo(options) {
      const refused = readOnlyRefusal(store, 'undoing an import');
      if (refused !== undefined) return refused;
      const newest = (await deps.durable.listImportBatches())[0];
      if (newest === undefined) return { ok: false, code: 'UNKNOWN_BATCH', message: 'there is no import to undo' };
      const report: unknown = newest.report;
      const snapshotId = typeof report === 'object' && report !== null && 'snapshotId' in report ? (report as { snapshotId?: unknown }).snapshotId : undefined;
      if (typeof snapshotId !== 'string') return { ok: false, code: 'UNKNOWN_BATCH', message: `the newest import (${newest.id}) records no pre_import snapshot, so it cannot be undone` };
      return restore(snapshotId, options);
    },
  };
}
