/**
 * Boot helpers of the app services (step 5.1a): the pure decision from `OpenResult` to an app mode, the empty state a tab
 * without stored data starts from, the notices of a boot report, and opening the storage without ever throwing for an
 * environment problem (docs/PERSISTENCE.md §4, Phase 5 plan review Q6).
 */
import type { CanonicalState } from '@/core/schema';
import { emptyRecordTables } from '@/core/schema';
import type { IdFactory } from '@/core/dataset/contracts';
import {
  createBroadcastChangeChannel,
  createDexieAdapter,
  createOrnDb,
  createWebLocksWriterLock,
  type BootReport,
  type ChangeChannel,
  type DexieAdapter,
  type DexieAdapterOptions,
  type OpenResult,
  type PersistenceEventSink,
  type WriterLock,
} from '@/persistence';
import type { AppEnv, ModeDecision } from './contracts';
import type { BootNotices } from './status';

/** Why a read-only boot is read-only, or why nothing is saved; `OpenResult` → what the app is. */
export function decideMode(opened: OpenResult): ModeDecision {
  if (opened.mode === 'unavailable') return { mode: 'session_only', reason: opened.reason, detail: opened.detail };
  if (opened.mode === 'read_write') return { mode: 'writer', reason: null, detail: null };
  const reason = opened.readOnlyReason ?? 'read_only';
  // A tab that merely waits for the writer follows it; every other reason is final for this tab (never promoted, E11).
  if (reason === 'other_tab_is_writer') return { mode: 'follower', reason, detail: opened.detail ?? null };
  return { mode: 'read_only', reason, detail: opened.detail ?? null };
}

/** A dataset with no records, for a tab with nothing stored (a fresh database, a read-only tab, a session-only tab). */
export function emptyState(ids: IdFactory): CanonicalState {
  const now = ids.now();
  return {
    meta: { datasetId: `orn-${ids.newId('dst').slice(4)}`, title: 'Untitled dataset', createdAt: now, updatedAt: now },
    records: emptyRecordTables(),
  };
}

export function noticesOf(report: BootReport): BootNotices {
  return {
    crashSuspected: report.crashSuspected,
    editorSessions: report.editorSessionIds.length,
    quarantinedRows: report.newlyQuarantined,
    assetsWithoutBytes: report.assetIdsWithoutBlob.length,
    unverifiedAssetBlobs: report.unverifiedAssetBlobs.length,
    migrationSteps: report.migrationSteps.length,
  };
}

export interface Storage {
  readonly adapter: DexieAdapter | undefined;
  readonly lock: WriterLock | undefined;
  readonly channel: ChangeChannel | undefined;
  readonly opened: OpenResult;
  /** Problems met while setting up (a channel that could not be made): the caller logs them. */
  readonly notes: readonly string[];
}

export interface StorageDeps {
  readonly ids: IdFactory;
  readonly validate: NonNullable<DexieAdapterOptions['validate']>;
  readonly onEvent: PersistenceEventSink;
}

const describe = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

/** Opens the database through the adapter. Never throws: a missing or failing IndexedDB is `mode: 'unavailable'`. */
export async function openStorage(env: AppEnv, deps: StorageDeps): Promise<Storage> {
  if (env.indexedDB === undefined || env.IDBKeyRange === undefined) {
    return { adapter: undefined, lock: undefined, channel: undefined, notes: [], opened: { mode: 'unavailable', reason: 'unknown', detail: 'IndexedDB is not available in this environment' } };
  }
  const notes: string[] = [];
  const lock = createWebLocksWriterLock(env.locks);
  let channel: ChangeChannel | undefined;
  if (env.channel !== undefined) {
    try {
      channel = createBroadcastChangeChannel(env.channel);
    } catch (error) {
      notes.push(`the change channel could not be created; other tabs will not hear about changes (${describe(error)})`);
    }
  }
  let adapter: DexieAdapter | undefined;
  try {
    const db = createOrnDb({ indexedDB: env.indexedDB, IDBKeyRange: env.IDBKeyRange });
    adapter = createDexieAdapter({
      db,
      clock: env.clock,
      ids: deps.ids,
      lock,
      ...(channel === undefined ? {} : { channel }),
      validate: deps.validate,
      runner: env.migrationRunner,
      generator: env.generator,
      scheduler: env.timers,
      onEvent: deps.onEvent,
    });
    const opened = await adapter.open();
    if (opened.mode !== 'unavailable') return { adapter, lock, channel, opened, notes };
    await closeQuietly(adapter, lock, channel);
    return { adapter: undefined, lock: undefined, channel: undefined, opened, notes };
  } catch (error) {
    await closeQuietly(adapter, lock, channel);
    return { adapter: undefined, lock: undefined, channel: undefined, notes, opened: { mode: 'unavailable', reason: 'unknown', detail: `the database could not be opened (${describe(error)})` } };
  }
}

async function closeQuietly(adapter: DexieAdapter | undefined, lock: WriterLock, channel: ChangeChannel | undefined): Promise<void> {
  try {
    channel?.close();
  } catch {
    // closing a channel that is already gone is not a problem
  }
  await lock.release().catch(() => undefined);
  await adapter?.close().catch(() => undefined);
}
