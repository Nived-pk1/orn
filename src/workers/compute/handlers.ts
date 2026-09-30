/**
 * The compute worker's RPC handlers (step 4.2b): thin wrappers over the replica. The import and export methods keep their
 * old shape until steps 4.2c and 4.2d; until then they answer `NOT_READY` as a value, never a silent no-op.
 */
import type { ComputeWorkerApi } from '@/workers/rpc/contracts';
import { RpcHostError } from '@/workers/rpc/helpers';
import { createReplica, type Replica, type ReplicaOptions } from './replica';

export interface ComputeHandlers {
  readonly api: ComputeWorkerApi;
  readonly replica: Replica;
}

const later = (method: string, step: string): RpcHostError => new RpcHostError('NOT_READY', `${method} is built in step ${step}`);

export function createComputeHandlers(options: ReplicaOptions = {}): ComputeHandlers {
  const replica = createReplica(options);
  const api: ComputeWorkerApi = {
    loadReplica: async ({ state, revision }) => replica.load(state, revision),
    applyChanges: async ({ changes }) => replica.apply(changes),
    validateAll: async ({ revision }, ctx) => replica.validateAll(revision, ctx.signal),
    findRoutes: async ({ revision, query }, ctx) => replica.findRoutes(revision, query, ctx.signal),
    importPreview: async () => {
      throw later('importPreview', '4.2c');
    },
    buildExport: async () => {
      throw later('buildExport', '4.2c');
    },
  };
  return { api, replica };
}
