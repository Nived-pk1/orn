/**
 * The search worker's RPC handlers (step 4.5): thin wrappers over a `SearchEngine`. The engine is the worker's only state. Every
 * param is checked before anything changes: a malformed document, update or query is `BAD_REQUEST` and the index is untouched;
 * a search with nothing loaded is `NOT_READY`.
 */
import { checkQuery, createSearchEngine, SearchNotLoaded } from '@/search/engine';
import type { SearchEngine } from '@/search/contracts';
import type { SearchWorkerApi } from '@/workers/rpc/contracts';
import { messageOf, RpcHostError } from '@/workers/rpc/helpers';

const isRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Runs an engine call; a shape complaint from the engine (`TypeError`, `RangeError`) becomes `BAD_REQUEST`. */
function guarded<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof SearchNotLoaded) throw new RpcHostError('NOT_READY', error.message);
    if (error instanceof TypeError || error instanceof RangeError) throw new RpcHostError('BAD_REQUEST', messageOf(error));
    throw error;
  }
}

export function createSearchHandlers(engine: SearchEngine = createSearchEngine()): SearchWorkerApi {
  return {
    async load(params) {
      if (typeof params !== 'object' || params === null || !Array.isArray(params.documents) || !isRevision(params.revision)) {
        throw new RpcHostError('BAD_REQUEST', 'load needs documents and a revision (a non-negative integer)');
      }
      guarded(() => engine.load(params.documents, params.revision));
    },
    async apply(params) {
      if (typeof params !== 'object' || params === null || !isRevision(params.fromRevision) || !isRevision(params.revision) || !Array.isArray(params.upsert) || !Array.isArray(params.remove) || !params.remove.every((id) => typeof id === 'string')) {
        throw new RpcHostError('BAD_REQUEST', 'apply needs fromRevision, revision, upsert and remove');
      }
      return guarded(() => engine.apply(params));
    },
    async search(params) {
      const problem = checkQuery(params);
      if (problem !== undefined) throw new RpcHostError('BAD_REQUEST', problem);
      return guarded(() => engine.search(params));
    },
    async serialize() {
      return guarded(() => engine.serialize());
    },
    async loadSerialized(params) {
      if (typeof params !== 'object' || params === null || typeof params.json !== 'string' || !isRevision(params.revision)) {
        throw new RpcHostError('BAD_REQUEST', 'loadSerialized needs json and a revision');
      }
      return guarded(() => engine.loadSerialized(params));
    },
  };
}
