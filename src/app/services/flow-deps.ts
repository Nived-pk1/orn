/** What every flow of step 5.1c is built over. Assembled once by `createFlows`; the flows read nothing else. */
import type { StoreHandle } from '@/core/commands';
import type { IdFactory } from '@/core/dataset/contracts';
import type { DexieAdapter } from '@/persistence';
import type { ReplicaSync } from '@/workers/compute';
import type { AppEnv } from './contracts';
import type { FlowGate } from './flow-gate';
import type { AssetStage, StoreRouter } from './flow-ports';
import type { MemoryStore } from './memory-store';
import type { EventLogWriter, StatusWriter } from './status';

/** The snapshot, batch and quarantine ports: the adapter's, or the memory store's in a session-only tab. */
export type DurableLike = Omit<MemoryStore, 'takeDropped'>;

export interface FlowDeps {
  readonly store: StoreHandle;
  /** undefined: a session-only tab; nothing is saved. */
  readonly adapter: DexieAdapter | undefined;
  readonly memory: MemoryStore | undefined;
  readonly durable: DurableLike;
  readonly assetStage: AssetStage;
  readonly router: StoreRouter;
  readonly gate: FlowGate;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
  readonly replica: { sync(): ReplicaSync | undefined };
  readonly env: Pick<AppEnv, 'migrationRunner' | 'generator' | 'random'>;
  readonly ids: IdFactory;
  /** Called once an import has been applied (the persistent-storage request lives behind it). */
  readonly afterImport: () => Promise<readonly string[]>;
  /** The things a session-only tab dropped to stay inside its bound since the last call, logged; the answer repeats them. */
  readonly droppedNotes: () => readonly string[];
}
