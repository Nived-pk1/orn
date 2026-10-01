/**
 * ELK behind `LayoutEngine` (ADR-007, step 4.4): layered, radial and stress through one adapter. A fresh ELK instance per layout
 * (no state shared between calls, so a result never depends on what ran before it). ELK cannot be interrupted: `signal` is
 * checked before the call and after it, and an aborted layout rejects with an AbortError so its result is never used. Anything ELK
 * throws propagates (the worker answers with the fallback, `elk_error`); ELK failing to load is `LayoutEngineUnavailable` (`engine_unavailable`).
 */
import type { LayoutEngine } from '../contracts';
import { LayoutEngineUnavailable } from '../errors';
import type { ElkLike } from './types';
import { mapRequest } from './map-request';
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
    async layout(request, signal) {
      if (signal.aborted) throw aborted();
      const began = options.clock();
      const input = mapRequest(request);
      const elk = await Promise.resolve(options.make()).catch((error: unknown) => {
        throw new LayoutEngineUnavailable(error instanceof Error ? error.message : String(error));
      });
      const answer = await elk.layout(input.graph);
      if (signal.aborted) throw aborted();
      const dropped = input.virtualIds;
      const kept = dropped.size === 0 ? answer : { ...answer, children: answer.children.filter((child) => !dropped.has(child.id)), edges: answer.edges.filter((edge) => !dropped.has(edge.id)) };
      return mapResult(request, kept, input.notes, options.clock() - began);
    },
  };
}
