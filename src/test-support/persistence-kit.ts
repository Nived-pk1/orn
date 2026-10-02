/**
 * Helpers for tests of src/persistence: a fresh fake-indexeddb database per test, a manual scheduler (retry
 * delays are asserted, never slept), a transaction spy, and the seed / load pair P-01 needs. Test-only.
 */
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { assembleChangeSet, createIdFactory, documentToState } from '@/core/dataset';
import type { ChangeSet } from '@/core/dataset/contracts';
import {
  DATASET_FORMAT,
  CURRENT_SCHEMA_VERSION,
  RECORD_KINDS,
  emptyRecordTables,
  type AnyRecord,
  type CanonicalState,
  type DatasetDocument,
  type RecordKind,
} from '@/core/schema';
import { createMigrationRunner } from '@/core/migrations';
import { sha256OfBlob } from '@/persistence/blob-hash';
import { alwaysGrantedLock } from '@/persistence/lock';
import { createDexieAdapter, type DexieAdapter, type DexieAdapterOptions } from '@/persistence/adapter';
import { createOrnDb, type DbVersionStep, type OrnDb } from '@/persistence/db';
import type { WriterLock } from '@/persistence/contracts';
import type { PersistenceEvent, Scheduler } from '@/persistence/events';

/** Bytes with their real SHA-256: `assetBlobs` is content-addressed, so a write whose bytes do not hash to the record's sha256 is refused. */
export async function hashedBlob(text: string, type = 'image/png'): Promise<{ readonly sha256: string; readonly blob: Blob }> {
  const blob = new Blob([text], { type });
  return { sha256: await sha256OfBlob(blob), blob };
}

export interface ManualScheduler extends Scheduler {
  /** Delays of every timer ever scheduled, in order. */
  readonly delays: number[];
  /** Number of timers scheduled and neither fired nor cancelled. */
  live(): number;
  /** Resolves with the delay of the oldest live timer, waiting until one is scheduled. Does not fire it. */
  waitForTimer(): Promise<number>;
  /** Fires the oldest live timer. */
  fire(): void;
  /** Delays of the live timers, oldest first. */
  liveDelays(): number[];
  /** Fires the oldest live timer whose delay is `ms`; false when there is none. */
  fireAfter(ms: number): boolean;
}

export function manualScheduler(): ManualScheduler {
  interface Timer {
    readonly ms: number;
    readonly run: () => void;
    done: boolean;
  }
  const timers: Timer[] = [];
  const delays: number[] = [];
  let waiting: (() => void) | undefined;
  const liveTimers = (): Timer[] => timers.filter((t) => !t.done);
  return {
    delays,
    after(ms, run) {
      const timer: Timer = { ms, run, done: false };
      timers.push(timer);
      delays.push(ms);
      waiting?.();
      return () => {
        timer.done = true;
      };
    },
    live: () => liveTimers().length,
    async waitForTimer() {
      while (liveTimers().length === 0) await new Promise<void>((resolve) => (waiting = resolve));
      return (liveTimers()[0] as Timer).ms;
    },
    liveDelays: () => liveTimers().map((timer) => timer.ms),
    fireAfter(ms) {
      const timer = liveTimers().find((candidate) => candidate.ms === ms);
      if (timer === undefined) return false;
      timer.done = true;
      timer.run();
      return true;
    },
    fire() {
      const timer = liveTimers()[0];
      if (timer === undefined) throw new Error('no live timer to fire');
      timer.done = true;
      timer.run();
    },
  };
}

export interface TestDb {
  readonly indexedDB: IDBFactory;
  readonly db: OrnDb;
  readonly log: TransactionLog;
  readonly faults: Faults;
  /** Every mutation request that reached IndexedDB, in order (failed ones included). */
  readonly mutations: { readonly store: string; readonly type: string; readonly values: readonly unknown[] }[];
}

/**
 * A new, empty fake IndexedDB (its own factory, so nothing leaks between tests). The transaction spy and the
 * fault injector are installed before the first operation: Dexie only applies middleware registered before open.
 */
export function freshDb(versions?: readonly DbVersionStep[], indexedDB: IDBFactory = new IDBFactory()): TestDb {
  const db = createOrnDb({ indexedDB, IDBKeyRange, ...(versions !== undefined ? { versions } : {}) });
  const mutations: TestDb['mutations'] = [];
  return { indexedDB, db, log: spyOnTransactions(db), faults: injectFaults(db, mutations), mutations };
}

export interface TestAdapter extends TestDb {
  readonly adapter: DexieAdapter;
  readonly scheduler: ManualScheduler;
  readonly events: PersistenceEvent[];
}

export function freshAdapter(options: Partial<Omit<DexieAdapterOptions, 'db'>> = {}, testDb: TestDb = freshDb()): TestAdapter {
  const scheduler = manualScheduler();
  const events: PersistenceEvent[] = [];
  let ms = 1_790_000_000_000;
  const clock = { nowMs: () => (ms += 1000) };
  let step = 0;
  const adapter = createDexieAdapter({
    db: testDb.db,
    clock,
    ids: createIdFactory(clock, { next: () => ((step += 1) * 0.0137) % 1 }),
    lock: alwaysGrantedLock,
    runner: createMigrationRunner(),
    scheduler,
    onEvent: (event) => events.push(event),
    ...options,
  });
  return { ...testDb, adapter, scheduler, events };
}

/** Reopens the same fake IndexedDB in a new database handle and adapter (a page reload). */
export function reopen(previous: TestDb, options: Partial<Omit<DexieAdapterOptions, 'db'>> = {}): TestAdapter {
  previous.db.close();
  return freshAdapter(options, freshDb(undefined, previous.indexedDB));
}

/** The state with the same meta and no records: what a fresh database stands for. */
export function emptyLike(state: CanonicalState): CanonicalState {
  return { meta: state.meta, records: emptyRecordTables() };
}

/** A `replace` ChangeSet that creates every record of `state`: how a whole state is saved through the queue. */
export function seedChangeSet(state: CanonicalState, revision = 1): ChangeSet {
  return assembleChangeSet({ revision, label: 'seed', cause: 'replace', before: emptyLike(state), after: state, patches: [], inversePatches: [] });
}

/** Rows as read back from IndexedDB → the state they describe (grouped by kind, unvalidated: boot does L1). */
export function rowsToState(rows: readonly unknown[], meta: unknown): CanonicalState {
  const records = {} as Record<RecordKind, AnyRecord[]>;
  for (const kind of RECORD_KINDS) records[kind] = [];
  for (const row of rows as readonly AnyRecord[]) records[row.kind].push(row);
  const doc = {
    format: DATASET_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    exportScope: 'full',
    generator: { app: 'test', version: '0' },
    meta,
    records,
  } as unknown as DatasetDocument;
  const result = documentToState(doc);
  if (!result.ok) throw new Error(`stored rows repeat an ID: ${JSON.stringify(result.duplicates.slice(0, 3))}`);
  return result.state;
}

export interface Loaded {
  readonly state: CanonicalState;
  readonly revision: unknown;
  readonly schemaVersion: unknown;
}

export async function loadState(adapter: DexieAdapter): Promise<Loaded> {
  const { rows, meta } = await adapter.readCommitted();
  return { state: rowsToState(rows, meta.datasetMeta), revision: meta.revision, schemaVersion: meta.schemaVersion };
}

export interface TransactionLog {
  readonly transactions: { readonly stores: readonly string[]; readonly mode: string }[];
  /** Read-write transactions only. */
  writes(): { readonly stores: readonly string[]; readonly mode: string }[];
}

/** Records every IndexedDB transaction the database opens (Dexie's DBCore, the layer below Dexie's own API). */
function spyOnTransactions(db: OrnDb): TransactionLog {
  const transactions: { stores: readonly string[]; mode: string }[] = [];
  db.use({
    stack: 'dbcore',
    name: 'transaction-spy',
    create: (down) => ({
      ...down,
      transaction(stores, mode, options) {
        transactions.push({ stores: [...stores], mode });
        return down.transaction(stores, mode, options);
      },
    }),
  });
  return { transactions, writes: () => transactions.filter((t) => t.mode === 'readwrite') };
}

export interface Faults {
  /** Every mutation of `store` fails with `error()` until `clear()` (a full disk, a broken store). */
  fail(store: string, error: () => Error): void;
  clear(): void;
}

function injectFaults(db: OrnDb, mutations: TestDb['mutations']): Faults {
  const failing = new Map<string, () => Error>();
  db.use({
    stack: 'dbcore',
    name: 'fault-injector',
    create: (down) => ({
      ...down,
      table(name) {
        const table = down.table(name);
        return {
          ...table,
          mutate(request) {
            mutations.push({ store: name, type: request.type, values: 'values' in request ? request.values : [] });
            const error = failing.get(name);
            return error === undefined ? table.mutate(request) : Promise.reject(error());
          },
        };
      },
    }),
  });
  return { fail: (store, error) => void failing.set(store, error), clear: () => failing.clear() };
}

/** A DOMException as the browser raises it when storage is full. */
export const quotaError = (): Error => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

/** A writer lock stub that answers `result` and records how it was used. */
export function stubLock(result: 'acquired' | 'held_elsewhere' | 'unsupported' = 'acquired'): WriterLock & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    acquire: () => {
      calls.push('acquire');
      return Promise.resolve(result);
    },
    whenAcquired: () => new Promise<void>(() => undefined),
    release: () => {
      calls.push('release');
      return Promise.resolve();
    },
  };
}

/** Saves `state` (revision 1, or `revision`) through the queue into a fresh fake IndexedDB, then reopens it: a page reload before boot. */
export async function savedDatabase(state: CanonicalState, options: Partial<Omit<DexieAdapterOptions, 'db'>> = {}, revision = 1): Promise<TestAdapter> {
  const first = freshAdapter();
  await first.adapter.writeChanges(seedChangeSet(state, revision), state);
  return reopen(first, options);
}
