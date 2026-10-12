/**
 * The export screen's port (step 5.9b), made from the app services. The feature imports none of this. Export reads only, so it works in
 * every tab mode (a follower, a read-only tab, a session-only tab); the one thing that stops it is another whole-state operation.
 */
import { downloadBlob, type ExportPorts } from '@/features/data-exchange';
import type { RecordRef } from '@/core/schema';
import { createDescriber } from '@/core/graph/family/describe';
import type { AppStatus } from '@/app/services';
import type { WindowServices } from './context';

/** Why an export cannot start now, in words; undefined: it can (in every mode). */
export const exportReason = (status: Pick<AppStatus, 'operation'>): string | undefined => (status.operation === null ? undefined : 'another operation is running');

export function createExportPorts(services: WindowServices, nowMs: () => number, log: (type: string, message: string) => void): ExportPorts {
  const { flows, status, store } = services;
  return {
    run: (options, format, flow) => flows.export(options, format, flow),
    datasetTitle: () => store.getState().meta.title,
    today: () => new Date(nowMs()).toISOString().slice(0, 10),
    images: () => {
      const assets = Object.values(store.getState().records.asset);
      return { count: assets.length, bytes: assets.reduce((sum, asset) => sum + asset.byteSize, 0) };
    },
    nameOf: (ref: RecordRef) => (ref.kind === 'asset' ? (store.getState().records.asset[ref.id]?.filename ?? undefined) : createDescriber(store.getState()).describe(ref)?.name),
    unavailable: () => exportReason(status.get()),
    save: downloadBlob,
    log,
  };
}
