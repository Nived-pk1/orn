/**
 * The follower side of the app services (step 5.1a, docs/PERSISTENCE.md §10, E11). A tab that is not the writer follows it
 * through the follower controller; the controller's events become AppStatus fields and event-log entries. Promotion: the tab
 * stays read-only until the controller has reloaded the store, then a write queue is attached and the mode is `writer`. A
 * refused promotion keeps the tab read-only with its reason; the controller does not ask for the lock again by itself, and
 * neither does this module (E11: the user reloads).
 */
import type { StoreHandle } from '@/core/commands';
import {
  createFollower,
  type DexieAdapter,
  type Follower,
  type FollowerEvent,
  type ChangeChannel,
  type WriterLock,
} from '@/persistence';
import { CURRENT_SCHEMA_VERSION } from '@/core/schema';
import { noticesOf } from './boot';
import type { ValidatePort } from './replica';
import type { EventLogWriter, StatusWriter } from './status';
import type { WriterPart } from './writer';

export interface FollowerPartOptions {
  readonly adapter: DexieAdapter;
  readonly channel: ChangeChannel | undefined;
  readonly lock: WriterLock;
  readonly store: StoreHandle;
  /** Revision of what boot loaded; null when nothing was stored (the store then holds an empty dataset). */
  readonly revision: number | null;
  readonly validate: ValidatePort;
  readonly status: StatusWriter;
  readonly log: EventLogWriter;
  readonly writer: WriterPart;
  /** Called after the store was reloaded whole (a follower reload, a first load, a promotion): derived checks start over. */
  readonly onReload?: () => void;
}

/** A follower event as one log line. The events that carry a whole state are summarised, never stored. */
export function summariseFollowerEvent(event: FollowerEvent): { readonly type: string; readonly message: string } {
  switch (event.type) {
    case 'applied':
      return { type: event.type, message: `applied revision ${event.revision} (${event.changed} records)` };
    case 'reloaded':
      return { type: event.type, message: `reloaded at revision ${event.revision} (${event.reason}; ${event.rejectedRows} rows rejected)` };
    case 'loaded':
      return { type: event.type, message: `loaded revision ${event.revision} (${event.reason}; ${event.rejectedRows} rows rejected)` };
    case 'validation_fallback':
      return { type: event.type, message: event.reason };
    case 'row_rejected':
      return { type: event.type, message: `row ${event.id} fails L1 and was not applied: ${event.issues.slice(0, 3).join('; ')}` };
    case 'reload_failed':
      return { type: event.type, message: `reload failed (${event.reason}): ${event.detail}` };
    case 'message_ignored':
      return { type: event.type, message: `a change message was ignored (${event.reason})` };
    case 'apply_refused':
      return { type: event.type, message: `a remote change was refused (${event.code}): ${event.message}` };
    case 'promoted':
      return { type: event.type, message: `promoted to writer at revision ${event.revision}` };
    case 'promotion_failed':
      return { type: event.type, message: `promotion refused (${event.reason}): ${event.detail}` };
    case 'error':
      return { type: event.type, message: event.message };
  }
}

export function startFollower(options: FollowerPartOptions): Follower {
  const { status, log, writer, store } = options;
  status.update({ promotion: 'waiting' });
  const follower = createFollower({
    adapter: options.adapter,
    ...(options.channel === undefined ? {} : { channel: options.channel }),
    lock: options.lock,
    store,
    revision: options.revision,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    validate: options.validate,
  });
  // What other tabs set aside shows here too: the count is READ (never written) after each applied change and each full reload. A newer
  // read supersedes an older one, and a promotion's own count (its boot) supersedes any read still on its way.
  let counting = 0;
  const recount = (): void => {
    counting += 1;
    const mine = counting;
    options.adapter.countQuarantine().then(
      (count) => {
        if (mine === counting && status.get().mode !== 'writer') status.update({ quarantinedCount: count });
      },
      (error: unknown) => log.add({ source: 'app', event: { type: 'quarantine_count_failed', message: `the quarantine count could not be read (${error instanceof Error ? error.message : String(error)})` } }),
    );
  };
  follower.subscribe((event) => {
    log.add({ source: 'follower', event: summariseFollowerEvent(event) });
    switch (event.type) {
      case 'applied':
        recount();
        break;
      case 'reloaded':
      case 'loaded':
        status.update({ followerReloads: status.get().followerReloads + 1, reloadFailure: null });
        options.onReload?.();
        recount();
        break;
      case 'row_rejected':
        status.update({ rejectedRows: status.get().rejectedRows + 1 });
        break;
      case 'reload_failed':
        status.update({ reloadFailure: { reason: event.reason, detail: event.detail } });
        break;
      case 'validation_fallback':
        status.update({ validation: { where: 'main', reason: event.reason } });
        break;
      case 'promoted': {
        counting += 1; // a read still on its way is older than this boot's count
        writer.attach();
        const report = event.bootReport;
        status.update({
          mode: 'writer',
          reason: null,
          detail: null,
          promotion: 'promoted',
          quarantinedCount: event.quarantinedCount,
          save: writer.currentSave(),
          ...(report === undefined ? {} : { notices: noticesOf(report), validation: report.validation, singleTab: report.singleTab }),
        });
        options.onReload?.();
        break;
      }
      case 'promotion_failed':
        status.update({ mode: 'read_only', reason: event.reason, detail: event.detail, promotion: 'refused', save: writer.currentSave() });
        break;
      default:
        break;
    }
  });
  return follower;
}
