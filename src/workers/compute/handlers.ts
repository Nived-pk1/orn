/**
 * The compute worker's RPC handlers: thin wrappers over the replica (step 4.2b), the import host (step 4.2c) and the export
 * functions (step 4.2e).
 */
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';
import { taskOptionsFrom, withTransfer } from '@/workers/rpc/helpers';
import { migrationRunner } from '@/core/migrations';
import type { MigrationRunner } from '@/core/migrations/contracts';
import { assertUtcInstant, buildExportBytes, planExport } from './export-flow';
import { createImportHost, type ImportHost } from './import-host';
import { createReplica, type Replica, type ReplicaOptions } from './replica';
import { buildSnapshotBytes } from './snapshot-build';
import { restoreDocument } from './snapshot-decode';

export interface ComputeHandlers {
  readonly api: ComputeWorkerApi;
  readonly replica: Replica;
  readonly imports: ImportHost;
}

export interface ComputeHandlerOptions extends ReplicaOptions {
  /** Migrates a decoded snapshot (`snapshotDecode`); default: the app's runner. Injected so tests can run a synthetic chain. */
  readonly runner?: MigrationRunner;
}

export function createComputeHandlers(options: ComputeHandlerOptions = {}): ComputeHandlers {
  const runner = options.runner ?? migrationRunner;
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
    snapshotBuild: async ({ revision, reason, exportedAt, generator }) => {
      const held = replica.snapshot();
      if (held.revision !== revision) return { ok: false, code: 'REPLICA_STALE', have: held.revision };
      assertUtcInstant('snapshotBuild', exportedAt);
      const built = buildSnapshotBytes(held.state, exportedAt, generator);
      if (!built.ok) return { ok: false, code: 'SERIALIZE_FAILED', message: built.message };
      // The bytes move to the caller; the copy here is not needed again.
      return withTransfer({ ok: true, bytes: built.bytes, revision, reason, schemaVersion: built.schemaVersion }, [built.bytes.buffer as ArrayBuffer]);
    },
    snapshotDecode: async ({ bytes, id, schemaVersion, baseRevision }) => {
      // One pending state at a time (an import batch may hold it); the replica must be where main's store is.
      if (imports.hasPrepared()) return { ok: false, code: 'BUSY', message: 'an import is prepared; finish or cancel it before restoring a snapshot' };
      const held = replica.snapshot();
      if (held.revision !== baseRevision) return { ok: false, code: 'REPLICA_STALE', have: held.revision };
      const restored = restoreDocument({ bytes, id, schemaVersion }, runner);
      if (!restored.ok) return restored.answer;
      const precomputed = replica.prepare(restored.state, baseRevision + 1);
      return { ok: true, state: restored.state, precomputed, steps: restored.steps };
    },
    adoptPending: async ({ revision }) => {
      const answer = replica.adopt(revision);
      imports.applied();
      return answer;
    },
    dropPending: async () => ({ dropped: imports.failed() }),
    exportPlan: async (params) => {
      const held = replica.snapshot();
      if (held.revision !== params.revision) return { ok: false, code: 'REPLICA_STALE', have: held.revision };
      return { ok: true, assets: planExport(held.state, params) };
    },
    exportBuild: async (params, ctx) => {
      const held = replica.snapshot();
      if (held.revision !== params.revision) return { ok: false, code: 'REPLICA_STALE', have: held.revision };
      assertUtcInstant('exportBuild', params.exportedAt);
      const built = await buildExportBytes(held.state, params, taskOptionsFrom(ctx));
      if (!built.ok) return built;
      // The file moves to the caller; the copy here is not needed again. A view onto part of a larger buffer is copied first.
      const bytes = built.result.bytes;
      const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();
      return withTransfer({ ok: true, result: { ...built.result, bytes: whole } }, [whole.buffer as ArrayBuffer]);
    },
  };
  return { api, replica, imports };
}
