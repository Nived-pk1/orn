/**
 * The data flows of the app services (step 5.1c): import (with Undo import), restore, export. `createFlows` joins the three
 * services over one gate (one whole-state operation at a time), one store router and one set of ports: the adapter's, or the
 * in-memory store of a session-only tab. After the first successful import in a writer tab it asks the browser for persistent
 * storage once, AFTER the import has answered and the operation slot is free (a browser may hold the question for a permission
 * prompt, Firefox does, so no flow waits for it); the answer, a refusal included, is `AppStatus.storage`.
 */
import type { StoreHandle } from '@/core/commands';
import type { IdFactory } from '@/core/dataset/contracts';
import type { DexieAdapter } from '@/persistence';
import type { ReplicaSync } from '@/workers/compute';
import type { AppEnv } from './contracts';
import type { DurableLike } from './flow-deps';
import { createFlowGate } from './flow-gate';
import { createStoreRouter, type AssetStage } from './flow-ports';
import type { Flows } from './flow-types';
import { createExportService } from './export-service';
import { createImportService } from './import-service';
import { createMemoryStore } from './memory-store';
import { createRestoreService } from './restore-service';
import type { EventLogWriter, StatusWriter } from './status';

export interface FlowsOptions {
  readonly store: StoreHandle;
  /** undefined: a session-only tab. */
  readonly adapter: DexieAdapter | undefined;
  readonly assetStage: AssetStage;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
  readonly replica: { sync(): ReplicaSync | undefined };
  readonly env: Pick<AppEnv, 'migrationRunner' | 'generator' | 'random' | 'storage'>;
  readonly ids: IdFactory;
}

const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function createFlows(options: FlowsOptions): Flows {
  const { store, adapter, status, log, env, ids } = options;
  const memory = adapter === undefined ? createMemoryStore({ ids, revision: () => store.getRevision(), generator: env.generator }) : undefined;
  const durable: DurableLike = adapter ?? (memory as NonNullable<typeof memory>);
  const gate = createFlowGate(status, log);
  const router = createStoreRouter(store);

  const droppedNotes = (): readonly string[] => {
    const dropped = memory?.takeDropped() ?? [];
    if (dropped.length === 0) return [];
    const message = `a session-only tab keeps a few snapshots in memory; dropped the oldest: ${dropped.join(', ')}`;
    log.add({ source: 'app', event: { type: 'memory_snapshots_dropped', message } });
    return [message];
  };

  let asked = false;
  /** Starts the one request and returns at once; nothing awaits it. Its answer only updates AppStatus.storage. */
  const afterImport = (): void => {
    if (asked || adapter === undefined || status.get().mode !== 'writer') return;
    asked = true;
    const storage = env.storage;
    if (storage === undefined) {
      status.update({ storage: { persistence: 'unknown', message: 'this environment cannot be asked for persistent storage' } });
      return;
    }
    status.update({ storage: { persistence: 'asking', message: 'waiting for the browser to answer the request for persistent storage' } });
    void (async () => {
      try {
        const granted = await storage.persist();
        const message = granted ? null : 'the browser did not grant persistent storage; it may clear this data when space is short, so export a backup';
        status.update({ storage: { persistence: granted ? 'persisted' : 'refused', message } });
        log.add({ source: 'app', event: { type: 'persistent_storage', message: granted ? 'persistent storage granted' : (message as string) } });
      } catch (error) {
        status.update({ storage: { persistence: 'unknown', message: `the persistent-storage request failed (${describe(error)})` } });
      }
    })();
  };

  const deps = { store, adapter, memory, durable, assetStage: options.assetStage, router, gate, status, log, replica: options.replica, env, ids, afterImport, droppedNotes };
  const imports = createImportService(deps);
  const restores = createRestoreService(deps);
  const exports = createExportService(deps);
  return { ...imports, undo: restores.undo, lastImport: restores.lastImport, restore: restores.restore, export: exports.export };
}
