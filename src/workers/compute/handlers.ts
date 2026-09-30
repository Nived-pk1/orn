/**
 * The compute worker's RPC handlers: thin wrappers over the replica (step 4.2b) and the import host (step 4.2c). The export
 * method keeps its old shape until step 4.2e; until then it answers `NOT_READY` as a value, never a silent no-op.
 */
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';
import { RpcHostError, withTransfer } from '@/workers/rpc/helpers';
import { createImportHost, type ImportHost } from './import-host';
import { createReplica, type Replica, type ReplicaOptions } from './replica';
import { buildSnapshotBytes } from './snapshot-build';

export interface ComputeHandlers {
  readonly api: ComputeWorkerApi;
  readonly replica: Replica;
  readonly imports: ImportHost;
}

export function createComputeHandlers(options: ReplicaOptions = {}): ComputeHandlers {
  const replica = createReplica(options);
  const imports = createImportHost(replica);
  const api: ComputeWorkerApi = {
    loadReplica: async ({ state, revision }) => replica.load(state, revision),
    applyChanges: async ({ changes }) => replica.apply(changes),
    validateAll: async ({ revision }, ctx) => replica.validateAll(revision, ctx.signal),
    findRoutes: async ({ revision, query }, ctx) => replica.findRoutes(revision, query, ctx.signal),
    importPreview: (params, ctx) => imports.preview(params, ctx),
    importRevise: (params, ctx) => imports.revise(params, ctx),
    importCancel: ({ batchId }) => imports.cancel(batchId),
    importPrepareApply: (params, ctx) => imports.prepareApply(params, ctx),
    snapshotBuild: async ({ revision, reason, exportedAt }) => {
      const held = replica.snapshot();
      if (held.revision !== revision) return { ok: false, code: 'REPLICA_STALE', have: held.revision };
      if (Number.isNaN(Date.parse(exportedAt)) || new Date(exportedAt).toISOString() !== exportedAt) {
        throw new RpcHostError('BAD_REQUEST', `snapshotBuild: exportedAt must be a UTC ISO timestamp with milliseconds, got ${JSON.stringify(exportedAt)}`);
      }
      const built = buildSnapshotBytes(held.state, exportedAt);
      if (!built.ok) return { ok: false, code: 'SERIALIZE_FAILED', message: built.message };
      // The bytes move to the caller; the copy here is not needed again.
      return withTransfer({ ok: true, bytes: built.bytes, revision, reason, schemaVersion: built.schemaVersion }, [built.bytes.buffer as ArrayBuffer]);
    },
    adoptPending: async ({ revision }) => {
      const answer = replica.adopt(revision);
      imports.applied();
      return answer;
    },
    dropPending: async () => ({ dropped: imports.failed() }),
    buildExport: async () => {
      throw new RpcHostError('NOT_READY', 'buildExport is built in step 4.2e');
    },
  };
  return { api, replica, imports };
}
