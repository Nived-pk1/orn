/**
 * The data-exchange feature's port (step 5.9a), made from the app services. The feature imports none of this. Why an import cannot
 * start is decided here: a writer or session-only tab may import (a session-only tab says "applied, not saved"); a follower or
 * read-only tab may not; and only one whole-state operation runs at a time.
 */
import type { DataExchangePorts } from '@/features/data-exchange';
import { createDescriber } from '@/core/graph/family/describe';
import type { RecordRef } from '@/core/schema';
import type { AppStatus } from '@/app/services';
import type { WindowServices } from './context';

/** Why an import cannot start now, in words; undefined: it can. */
export function importReason(status: Pick<AppStatus, 'mode' | 'reason' | 'operation'>): string | undefined {
  if (status.mode === null) return 'the app is still starting';
  if (status.mode !== 'writer' && status.mode !== 'session_only') return status.reason ?? (status.mode === 'follower' ? 'another tab is the writer' : 'this tab is read-only');
  if (status.operation !== null) return 'another operation is running';
  return undefined;
}

export function createImportPorts(services: WindowServices, log: (type: string, message: string) => void): DataExchangePorts {
  const { flows, status, store } = services;
  return {
    preview: (blob, fileName, request, options) => flows.preview(blob, fileName, request, options),
    revise: (batchId, request, options) => flows.revise(batchId, request, options),
    cancel: (batchId) => flows.cancel(batchId),
    apply: (batchId, plan, options) => flows.apply(batchId, plan, options),
    undo: (options) => flows.undo(options),
    lastImport: () => flows.lastImport(),
    unavailable: () => importReason(status.get()),
    operation: () => status.get().operation,
    subscribeOperation: (listener) => status.subscribe(() => listener()),
    recordCount: () => Object.values(store.getState().records).reduce((sum, byId) => sum + Object.keys(byId as object).length, 0),
    nameOf: (ref: RecordRef) => createDescriber(store.getState()).describe(ref)?.name,
    log,
  };
}
