/**
 * ELK behind `LayoutEngine` (ADR-007, step 4.4): layered, radial and stress through one adapter. A fresh ELK instance per layout
 * (no state shared between calls, so a result never depends on what ran before it). ELK cannot be interrupted: `signal` is
 * checked before the call and after it, and an aborted layout rejects with an AbortError so its result is never used. Anything ELK
 * throws propagates (the worker answers with the fallback, `elk_error`); ELK failing to load is `LayoutEngineUnavailable` (`engine_unavailable`).
 */
import type { LayoutEngine } from '../contracts';
import { LayoutEngineUnavailable } from '../errors';
import type { ElkLike } from './types';
import { mapRequest, type ElkRequest } from './map-request';
import { mapResult } from './map-result';

export interface ElkEngineOptions {
  /** Makes an ELK instance (the real one: `loadElk()`'s answer; a test: a fake). May reject (ELK could not load). */
  readonly make: () => ElkLike | Promise<ElkLike>;
  /** Milliseconds, monotonic; only times the call. */
  readonly clock: () => number;
}

const aborted = (): DOMException => new DOMException('layout cancelled', 'AbortError');

export function createElkEngine(options: ElkEngineOptions): LayoutEngine {
  return {
    async warmUp() {
      await Promise.resolve(options.make()).catch((error: unknown) => {
        throw new LayoutEngineUnavailable(error instanceof Error ? error.message : String(error));
      });
    },
    async layout(request, signal) {
      if (signal.aborted) throw aborted();
      const began = options.clock();
      // `grid` is the grid layout's (the worker answers it before ELK); a stray one is laid out layered and says so
      const asked: ElkRequest = request.algorithm === 'grid' ? { ...request, algorithm: 'layered' } : (request as ElkRequest);
      const input = mapRequest(asked);
      const elk = await Promise.resolve(options.make()).catch((error: unknown) => {
        throw new LayoutEngineUnavailable(error instanceof Error ? error.message : String(error));
      });
      const answer = await elk.layout(input.graph);
      if (signal.aborted) throw aborted();
      const dropped = input.virtualIds;
      const kept = dropped.size === 0 ? answer : { ...answer, children: answer.children.filter((child) => !dropped.has(child.id)), edges: answer.edges.filter((edge) => !dropped.has(edge.id)) };
      const notes = request.algorithm === 'grid' ? [...input.notes, 'grid is not an ELK algorithm: laid out layered'] : input.notes;
      return mapResult(asked, kept, notes, options.clock() - began);
    },
  };
}
