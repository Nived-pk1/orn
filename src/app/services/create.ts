/**
 * `createAppServices(env)` (step 5.1a, E1): boots the persistence adapter, builds the one canonical store, and wires the
 * compute replica, the derived indexes, the write queue (writer) or the follower controller (follower). Everything comes from
 * `env`; no global is read; an environment problem is a status, never an exception. Modes (docs/PERSISTENCE.md §4):
 *
 *   read_write                                  → writer (write queue attached; `singleTab` kept)
 *   read_only, other_tab_is_writer              → follower (read-only until promoted)
 *   read_only, newer_schema / integrity_failure
 *              / migration_failed               → read-only with the reason and detail, an empty store, never promoted
 *   unavailable                                 → session-only (a store in memory, no adapter, nothing saved)
 *   nothing stored yet                          → an empty writer
 *
 * Step 5.1b adds the engines on top (docs/PROGRESS.md): chem and layout clients with their warm-up gates, the L4 service, the search
 * client, service and sync with the warm-boot cache, and the depiction service. Their worker threads are created at their first
 * need, not here: chem at the first L4 run (a debounce after boot), layout at the first layout request, search when the boot path
 * reads the cache or loads. A missing factory is a status.
 */
import { createCanonicalStore, type StoreHandle } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import type { Follower } from '@/persistence';
import { decideMode, emptyState, noticesOf, openStorage } from './boot';
import type { AppEnv, AppServices } from './contracts';
import { createChemPart, createLayoutPart } from './chem-layout';
import { createDepictionService } from './depiction';
import { createDerivedIndexes } from './derived-indexes';
import { startFollower } from './follower';
import { createFlows } from './flows';
import { createAssetStage } from './flow-ports';
import { createL4Part } from './l4-part';
import { createSearchPart } from './search-part';
import { checkStorageAtBoot } from './storage-check';
import { createReplicaPart } from './replica';
import { createEventLog, createStatusStore } from './status';
import { createWriterPart } from './writer';

const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export async function createAppServices(env: AppEnv): Promise<AppServices> {
  const log = createEventLog(() => env.clock.nowMs());
  const status = createStatusStore((error) => log.add({ source: 'app', event: { type: 'status_listener_error', message: describe(error) } }));
  const ids = createIdFactory(env.clock, env.random);
  const replica = createReplicaPart({ factory: env.workers.compute, status, log });
  const chemPart = createChemPart({ factory: env.workers.chem, status, log });
  const layoutPart = createLayoutPart({ factory: env.workers.layout, status, log });
  const depictions = createDepictionService(chemPart.service);

  // The compute worker starts now, so that its start overlaps the IndexedDB read (step 5.11a, candidate E). It is sent nothing here.
  replica.prewarm();
  const storage = await openStorage(env, { ids, validate: replica.validate, onEvent: (event) => log.add({ source: 'persistence', event }) });
  for (const note of storage.notes) log.add({ source: 'app', event: { type: 'storage_note', message: note } });
  const { adapter, opened } = storage;
  layoutPart.attachCache(adapter);
  const decision = decideMode(opened);
  const report = opened.mode === 'unavailable' ? undefined : opened.bootReport;

  const hasData = opened.mode !== 'unavailable' && opened.state !== null;
  const initial = opened.mode !== 'unavailable' && opened.state !== null ? opened.state : emptyState(ids);
  const revision = opened.mode === 'unavailable' ? 0 : opened.revision;
  const precomputed = hasData ? report?.precomputed : undefined;
  let isReadOnly = (): boolean => decision.mode !== 'writer' && decision.mode !== 'session_only';
  let store: StoreHandle;
  try {
    store = createCanonicalStore({
      initial,
      revision,
      readOnly: () => isReadOnly(),
      ...(precomputed !== undefined ? { precomputed } : { validateInitial: hasData }),
    });
  } catch (error) {
    // The boot report and the store disagree: a programmer error, not an environment problem. Release what was opened first.
    replica.stop();
    depictions.dispose();
    chemPart.stop();
    layoutPart.stop();
    await Promise.allSettled([storage.lock?.release(), adapter?.close()]);
    throw error;
  }

  status.update({
    mode: decision.mode,
    reason: decision.reason,
    detail: decision.detail,
    singleTab: report?.singleTab ?? false,
    validation: report?.validation ?? null,
    notices: report === undefined ? null : noticesOf(report),
    quarantinedCount: opened.mode === 'unavailable' ? 0 : opened.quarantinedCount,
  });
  if (report?.crashSuspected === true && report.editorSessionIds.length === 0) log.add({ source: 'app', event: { type: 'crash_suspected', message: 'the last session may not have closed cleanly; there are no editor sessions to restore, so nothing is shown' } });
  if (decision.mode === 'session_only') log.add({ source: 'app', event: { type: 'session_only', message: `nothing is saved in this session (${decision.reason ?? 'unknown'}): ${decision.detail ?? ''}` } });
  else if (decision.mode === 'read_only') log.add({ source: 'app', event: { type: 'read_only', message: `this tab is read-only (${decision.reason ?? 'unknown'}): ${decision.detail ?? ''}` } });

  checkStorageAtBoot({ env, status, log, hasData, writer: decision.mode === 'writer' });
  replica.start(store);
  const indexes = createDerivedIndexes({ store, clock: env.clock });
  const assetStage = createAssetStage();
  const writer = createWriterPart({ store, adapter, status, log, ids, blobsFor: assetStage.blobsFor });
  const l4 = createL4Part({ store, indexes, chem: chemPart.service, timers: env.timers, status, log });
  const search = createSearchPart({
    factory: env.workers.search,
    store,
    indexes,
    derivedFormulaOf: l4.service.derivedFormulaOf,
    adapter,
    timers: env.timers,
    status,
    log,
  });
  const offFormulas = l4.service.subscribeFormulas((changed) => search.refresh(changed));

  let follower: Follower | undefined;
  if (decision.mode === 'writer') writer.attach();
  else if (decision.mode === 'follower' && adapter !== undefined && storage.lock !== undefined) {
    follower = startFollower({
      adapter,
      channel: storage.channel,
      lock: storage.lock,
      store,
      revision: opened.mode !== 'unavailable' && opened.state !== null ? opened.revision : null,
      validate: replica.validate,
      status,
      log,
      writer,
      onReload: () => l4.checkAll(),
    });
    // The store is read-only until the controller has reloaded it after a promotion (INV-28).
    isReadOnly = () => follower?.isReadOnly() ?? true;
  }
  status.update({ stage: 'ready' });
  l4.checkAll();
  void search.started();

  const flows = createFlows({ store, adapter, assetStage, status, log, replica: { sync: () => replica.sync() }, env, ids });

  let disposing: Promise<void> | undefined;
  const dispose = (): Promise<void> => {
    disposing ??= (async () => {
      if (writer.pendingWrites()) log.add({ source: 'app', event: { type: 'disposed_with_pending_writes', message: 'the services were disposed while writes were pending' } });
      writer.stop();
      offFormulas();
      search.stop();
      l4.stop();
      depictions.dispose();
      chemPart.stop();
      layoutPart.stop();
      indexes.dispose();
      replica.stop();
      await Promise.allSettled([follower?.close(), storage.lock?.release()]);
      try {
        storage.channel?.close();
      } catch {
        // a channel that is already closed is fine
      }
      await Promise.allSettled([adapter?.close()]);
      status.update({ stage: 'disposed' });
      status.clear();
      log.clear();
    })();
    return disposing;
  };

  return {
    store,
    status,
    log,
    logApp: (type, message) => log.add({ source: 'app', event: { type, message } }),
    indexes,
    bootReport: report,
    persistence: adapter,
    replicaSync: () => replica.sync(),
    pendingWrites: () => writer.pendingWrites(),
    saveEverythingNow: () => writer.saveEverythingNow(),
    retryReplica: () => replica.retry(),
    chem: chemPart.service,
    l4: l4.service,
    layout: layoutPart.service,
    search: search.search,
    searchSync: () => search.sync(),
    depictions,
    flows,
    async retryEngine(name) {
      const result = await (name === 'chem' ? chemPart : layoutPart).retry();
      log.add({ source: 'app', event: { type: 'engine_retry', message: `retry of the ${name} engine: ${result.ok ? 'ready' : result.message}` } });
      if (result.ok && name === 'chem') l4.checkAll();
      return result;
    },
    shutdown: () => writer.shutdown(),
    resume: () => writer.resume(),
    dispose,
  };
}
