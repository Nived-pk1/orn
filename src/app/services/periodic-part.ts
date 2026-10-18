/**
 * Automatic snapshots in the app (step 6.1b part 4, openItem 119): in the WRITER tab only (a follower, a read-only tab and a session with
 * nothing saved take none; a promoted follower starts when it becomes the writer), the existing periodic policy decides and the compute
 * worker builds the bytes (`startComputePeriodicSnapshots`); this part wires the ports and keeps `AppStatus.periodicSnapshots`
 * (when the newest was made, how many are kept, why the last attempt failed). A failed attempt is an event in the log and words in the
 * status line, never a banner; a stale one (the data moved on while the bytes were built) is only an event: the next ChangeSet tries again.
 */
import { createPeriodicPolicy, type DexieAdapter } from '@/persistence';
import type { StoreHandle } from '@/core/commands';
import type { IdFactory } from '@/core/dataset/contracts';
import { startComputePeriodicSnapshots, type PeriodicFlow, type PeriodicOutcome } from '@/workers/compute/periodic-flow';
import type { AppEnv } from './contracts';
import type { ReplicaPart } from './replica';
import type { EventLogWriter, StatusWriter } from './status';

export interface PeriodicPart {
  stop(): void;
  /** Resolves when no snapshot is being made (tests). */
  whenIdle(): Promise<void>;
}

export interface PeriodicPartOptions {
  readonly store: StoreHandle;
  readonly adapter: DexieAdapter | undefined;
  readonly replica: Pick<ReplicaPart, 'sync'>;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
  readonly ids: IdFactory;
  readonly env: Pick<AppEnv, 'clock' | 'generator'>;
}

export function createPeriodicPart(options: PeriodicPartOptions): PeriodicPart {
  const { store, adapter, replica, status, log, ids, env } = options;
  let flow: PeriodicFlow | undefined;
  let started = false;
  let stopped = false;

  /** What is stored now: the newest periodic snapshot and how many are kept (a read of the snapshot list, no bytes). */
  async function refresh(clearFailure: boolean): Promise<void> {
    if (adapter === undefined || stopped) return;
    try {
      const periodic = (await adapter.listSnapshots()).filter((summary) => summary.reason === 'periodic');
      const newest = periodic.reduce<string | null>((latest, summary) => (latest === null || summary.createdAt > latest ? summary.createdAt : latest), null);
      // an attempt that failed while this read was on its way keeps its words, unless a stored snapshot clears them
      if (!stopped) status.update({ periodicSnapshots: { lastAt: newest, kept: periodic.length, failure: clearFailure ? null : (status.get().periodicSnapshots?.failure ?? null) } });
    } catch (error) {
      const message = `the snapshot list could not be read (${error instanceof Error ? error.message : String(error)})`;
      log.add({ source: 'app', event: { type: 'periodic_snapshot_list_failed', message } });
      const was = status.get().periodicSnapshots;
      if (!stopped) status.update({ periodicSnapshots: { lastAt: was?.lastAt ?? null, kept: was?.kept ?? 0, failure: message } });
    }
  }

  function onOutcome(outcome: PeriodicOutcome): void {
    if (outcome.kind === 'stored') {
      log.add({ source: 'app', event: { type: 'periodic_snapshot', message: `an automatic snapshot of revision ${outcome.revision} was stored` } });
      void refresh(true);
    } else if (outcome.kind === 'stale') {
      log.add({ source: 'app', event: { type: 'periodic_snapshot_stale', message: `no automatic snapshot of revision ${outcome.revision} was stored (${outcome.message}); the next change tries again` } });
    } else {
      log.add({ source: 'app', event: { type: 'periodic_snapshot_failed', message: outcome.reason } });
      const was = status.get().periodicSnapshots;
      status.update({ periodicSnapshots: { lastAt: was?.lastAt ?? null, kept: was?.kept ?? 0, failure: outcome.reason } });
    }
  }

  function start(): void {
    if (started || stopped || adapter === undefined) return;
    started = true; // before the status update below, which calls back into `sync`
    status.update({ periodicSnapshots: { lastAt: null, kept: 0, failure: null } });
    void refresh(false);
    flow = startComputePeriodicSnapshots({
      store,
      policy: createPeriodicPolicy({ clock: env.clock }),
      replica: () => replica.sync(),
      snapshots: adapter,
      ids,
      generator: env.generator,
      onOutcome,
    });
  }

  const sync = (): void => {
    if (status.get().mode === 'writer') start();
  };
  const off = status.subscribe(sync);
  sync();

  return {
    stop() {
      stopped = true;
      off();
      flow?.stop();
      flow = undefined;
    },
    whenIdle: async () => void (await flow?.whenIdle()),
  };
}
