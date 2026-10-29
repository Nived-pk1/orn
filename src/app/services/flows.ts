/**
 * The data flows as the app sees them (7.2b A1). Every flow is an async function, so the services behind them (import, restore, export,
 * and the io and compute-flow code they pull in) live in `flows-core.ts`, a lazy chunk fetched by the first call and built once; nothing
 * of it is in the first paint. A chunk that cannot be fetched is a VALUE, not an exception (errors across module boundaries are values):
 * the flow answers `{ ok: false, code: 'LOAD_FAILED', message }` in words, nothing is remembered, and the next call tries again.
 */
import type { Flows, FlowRefusal } from './flow-types';
import type { FlowsOptions } from './flows-core';

export type { FlowsOptions } from './flows-core';

export const LOAD_FAILED_WORDS = 'This part of the app could not load. Check your connection and reload the page.';
const REFUSED: FlowRefusal = { ok: false, code: 'LOAD_FAILED', message: LOAD_FAILED_WORDS };

export function createFlows(options: FlowsOptions): Flows {
  let loaded: Promise<Flows> | undefined;
  const flows = (): Promise<Flows> => {
    loaded ??= import('./flows-core').then(
      (core) => core.createFlowsNow(options),
      (error: unknown) => {
        loaded = undefined;
        throw error;
      },
    );
    return loaded;
  };
  /** Runs `run` on the loaded flows, or answers `failed` when the chunk cannot be loaded. */
  const through = async <T, F>(run: (flows: Flows) => Promise<T>, failed: F): Promise<T | F> => {
    try {
      return await run(await flows());
    } catch (error) {
      if (loaded !== undefined) throw error; // the chunk loaded: a real failure inside a flow is not hidden here
      return failed;
    }
  };
  return {
    preview: (source, fileName, request, flow) => through((f) => f.preview(source, fileName, request, flow), REFUSED),
    revise: (batchId, request, flow) => through((f) => f.revise(batchId, request, flow), REFUSED),
    cancel: (batchId) => through((f) => f.cancel(batchId), { cancelled: false }),
    apply: (batchId, plan, flow) => through((f) => f.apply(batchId, plan, flow), REFUSED),
    undo: (flow) => through((f) => f.undo(flow), REFUSED),
    lastImport: () => through((f) => f.lastImport(), undefined),
    restore: (snapshotId, flow) => through((f) => f.restore(snapshotId, flow), REFUSED),
    export: (options, format, flow) => through((f) => f.export(options, format, flow), REFUSED),
  };
}
