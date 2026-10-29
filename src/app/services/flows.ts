/**
 * The data flows as the app sees them (7.2b A1). Every flow is an async function, so the services behind them (import, restore, export,
 * and the io and compute-flow code they pull in) live in `flows-core.ts`, a lazy chunk fetched by the first call and built once; nothing
 * of it is in the first paint. A chunk that cannot be fetched rejects that call (the next call tries again).
 */
import type { Flows } from './flow-types';
import type { FlowsOptions } from './flows-core';

export type { FlowsOptions } from './flows-core';

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
  return {
    preview: async (source, fileName, request, flow) => (await flows()).preview(source, fileName, request, flow),
    revise: async (batchId, request, flow) => (await flows()).revise(batchId, request, flow),
    cancel: async (batchId) => (await flows()).cancel(batchId),
    apply: async (batchId, plan, flow) => (await flows()).apply(batchId, plan, flow),
    undo: async (flow) => (await flows()).undo(flow),
    lastImport: async () => (await flows()).lastImport(),
    restore: async (snapshotId, flow) => (await flows()).restore(snapshotId, flow),
    export: async (options, format, flow) => (await flows()).export(options, format, flow),
  };
}
