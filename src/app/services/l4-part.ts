/**
 * The L4 chemistry checks of the app (step 5.1b, Phase 4 contract decisions Q2, Q10): the L4 service over its ports (the state, the
 * finding store, the store's indexes, the chem service, a debounce from `env.timers`), fed by `store.subscribe`. `checkAll` runs after
 * boot and after every replace or remote reload (import, restore, follower reload, promotion). L4 never changes canonical data and
 * never blocks a commit, so a follower tab runs it too (findings are derived data). A check the engine could not answer is "check
 * unavailable" in the status, never CHEM-001 (the service's own rule, Q7).
 */
import type { StoreHandle } from '@/core/commands';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import { createL4Service, type L4Service } from '@/workers/chem';
import type { ChemService } from '@/workers/chem';
import type { EventLogWriter, L4View, StatusWriter } from './status';
import { createDebounce, L4_QUIET_MS } from './timing';
import type { Scheduler } from '@/persistence';

export interface L4PartOptions {
  readonly store: StoreHandle;
  readonly indexes: { current(): ReadonlyIndexes };
  readonly chem: ChemService;
  readonly timers: Scheduler;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
}

export interface L4Part {
  readonly service: L4Service;
  /** Queue every species, reaction and mechanism (after boot, a reload, a successful engine retry). */
  checkAll(): void;
  stop(): void;
}

export function createL4Part(options: L4PartOptions): L4Part {
  const { store, status, log } = options;
  const debounce = createDebounce(options.timers, L4_QUIET_MS);
  const service = createL4Service({
    state: store.getState,
    findings: store.findings,
    indexes: () => options.indexes.current(),
    chem: options.chem,
    schedule: debounce.schedule,
    onError: (error) => log.add({ source: 'app', event: { type: 'l4_error', message: `an L4 job failed (${error instanceof Error ? `${error.name}: ${error.message}` : String(error)})` } }),
  });

  const view = (): L4View => {
    const { queued, notChecked } = service.summary();
    const engine = status.get().engines.chem;
    const worker = status.get().workers.chem;
    if (worker.state === 'down' || worker.state === 'absent' || engine.state === 'unavailable') {
      const why = worker.state === 'absent' ? worker.reason : worker.state === 'down' ? `the chemistry worker is down (${worker.reason})` : (engine.message ?? 'the structure toolkit could not load');
      return { state: 'unavailable', notChecked, queued, message: `check unavailable: ${why}` };
    }
    // A record the toolkit did not answer for is not clean: said out loud, whatever the state (never CHEM-001).
    const message = notChecked === 0 ? null : `check unavailable for ${notChecked} record${notChecked === 1 ? '' : 's'}: the structure toolkit did not answer for them`;
    return { state: queued > 0 ? 'checking' : 'idle', notChecked, queued, message };
  };
  const refresh = (): void => void status.update({ l4: view() });
  const offService = service.subscribe(refresh);
  const offStatus = status.subscribe(() => refresh()); // the engine or the worker changed state
  const offStore = store.subscribe((changes) => {
    // A replace (import, restore) wipes what L4 knew; everything is checked again. Anything else is incremental.
    if (changes.cause === 'replace') service.checkAll();
    else service.onChange(changes);
  });

  return {
    service,
    checkAll: () => service.checkAll(),
    stop() {
      offStore();
      offService();
      offStatus();
      debounce.cancel();
      service.dispose();
    },
  };
}
