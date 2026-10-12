import { describe, expect, it } from 'vitest';
import { INITIAL_STATUS, type AppStatus } from '@/app/services';
import { bannerKindOf, bannersOf, bootLinesOf, operationTextOf, saveTextOf, workersTextOf } from './banners';

const status = (patch: Partial<AppStatus>): AppStatus => ({ ...INITIAL_STATUS, stage: 'ready', mode: 'writer', ...patch });
const save = (patch: Partial<NonNullable<AppStatus['save']>>): NonNullable<AppStatus['save']> => ({
  state: 'saved', lastSavedRevision: 3, pendingRevisions: 0, lastError: null, failureReason: null, deletablePeriodicSnapshotIds: [], ...patch,
});
const ids = (s: AppStatus): string[] => bannersOf(s).map((b) => b.id);

describe('bannersOf: one banner per AppStatus condition', () => {
  it('a healthy writer has none', () => {
    expect(bannersOf(status({ save: save({}) }))).toEqual([]);
  });

  it.each([
    ['read-only follower', { mode: 'follower', reason: 'other_tab_is_writer' } as Partial<AppStatus>, 'follower', /another tab .* is the writer/],
    ['read-only for another reason', { mode: 'read_only', reason: 'newer_schema', detail: 'schema 9' } as Partial<AppStatus>, 'read_only', /read-only \(newer_schema\)\. schema 9/],
    ['single tab', { singleTab: true } as Partial<AppStatus>, 'single_tab', /no tab locks/],
    ['session-only (a window that refuses Blobs)', { mode: 'session_only', reason: 'blob_storage_refused', detail: 'x' } as Partial<AppStatus>, 'session_only', /^This browser window cannot keep data \(it may be a private window\)\. The app works, but nothing is saved after you close it\. Export a backup to keep your work\.$/],
    ['session-only', { mode: 'session_only', reason: 'indexeddb_unavailable' } as Partial<AppStatus>, 'session_only', /Nothing is saved in this session \(indexeddb_unavailable\)/],
    ['replica down', { replica: { state: 'down', reason: 'worker gave up', revision: null } } as Partial<AppStatus>, 'replica_down', /background copy .* down \(worker gave up\)/],
    ['validation fallback', { validation: { where: 'main', reason: 'no worker' } } as Partial<AppStatus>, 'validation_fallback', /ran on this page .* \(no worker\)/],
    ['storage asking', { storage: { persistence: 'asking', message: 'waiting' } } as Partial<AppStatus>, 'storage_asking', /^Waiting for the browser to answer the request for persistent storage\./],
    ['storage refused', { storage: { persistence: 'refused', message: 'the browser did not grant persistent storage; export a backup' } } as Partial<AppStatus>, 'storage_refused', /^The browser did not grant persistent storage; export a backup\.$/],
    ['storage refused, no message', { storage: { persistence: 'refused', message: null } } as Partial<AppStatus>, 'storage_refused', /^The browser did not grant persistent storage\. It may delete/],
    ['reload failure', { reloadFailure: { reason: 'read', detail: 'boom' } } as Partial<AppStatus>, 'reload_failure', /could not load another tab's changes \(read: boom\)/],
    ['rejected rows', { rejectedRows: 2 } as Partial<AppStatus>, 'rejected_rows', /2 rows written by another tab/],
    ['search down', { search: { ...INITIAL_STATUS.search, state: 'down', reason: 'index lost' } } as Partial<AppStatus>, 'search_down', /Search is unavailable \(index lost\)/],
    ['unchecked structures', { l4: { state: 'idle', notChecked: 1, queued: 0, message: 'timeout' } } as Partial<AppStatus>, 'l4_not_checked', /1 structure was not checked/],
  ])('%s', (_name, patch, id, text) => {
    const found = bannersOf(status(patch)).find((b) => b.id === id);
    expect(found?.text).toMatch(text);
  });

  it('a window that refuses Blobs offers Export a backup', () => {
    const banners = bannersOf(status({ mode: 'session_only', reason: 'blob_storage_refused', detail: 'x' }));
    expect(banners).toHaveLength(1);
    expect(banners[0]?.action).toEqual({ label: 'Export a backup', kind: 'export' });
  });

  it('a refused promotion says so, with Reload, and replaces the plain follower banner', () => {
    const banners = bannersOf(status({ mode: 'follower', promotion: 'refused', reason: 'lock_denied', detail: 'x' }));
    expect(banners.map((b) => b.id)).toEqual(['promotion_refused']);
    expect(banners[0]?.action).toEqual({ label: 'Reload', kind: 'reload' });
  });

  it('a revision gap offers "Save everything now"', () => {
    const banners = bannersOf(status({ save: save({ state: 'failed', failureReason: 'revision_gap', lastError: 'gap' }) }));
    expect(banners).toHaveLength(1);
    expect(banners[0]?.action).toEqual({ label: 'Save everything now', kind: 'save_everything' });
  });

  it('a down replica offers Retry', () => {
    expect(bannersOf(status({ replica: { state: 'down', reason: 'x', revision: null } }))[0]?.action).toEqual({ label: 'Retry', kind: 'retry_replica' });
  });

  it('an engine that could not load says "Check unavailable" with Retry; a worker that gave up says reload the page, with no Retry', () => {
    const unavailable = bannersOf(
      status({
        engines: { ...INITIAL_STATUS.engines, chem: { state: 'unavailable', message: 'wasm blocked' } },
        l4: { state: 'unavailable', notChecked: 0, queued: 0, message: 'wasm blocked' },
      }),
    );
    expect(unavailable.map((b) => b.id)).toEqual(['engine_chem']);
    expect(unavailable[0]?.text).toMatch(/^Check unavailable: .*wasm blocked/);
    expect(unavailable[0]?.action).toEqual({ label: 'Retry', kind: 'retry_chem' });
    const layout = bannersOf(status({ engines: { ...INITIAL_STATUS.engines, layout: { state: 'unavailable', message: 'elk' } } }));
    expect(layout[0]).toMatchObject({ id: 'engine_layout', action: { kind: 'retry_layout' } });

    const down = bannersOf(
      status({
        workers: { ...INITIAL_STATUS.workers, chem: { state: 'down', started: true, reason: 'restart cap' } },
        engines: { ...INITIAL_STATUS.engines, chem: { state: 'unavailable', message: 'x' } },
      }),
    );
    expect(down.map((b) => b.id)).toEqual(['worker_down_chem']);
    expect(down[0]?.text).toMatch(/Reload the page/);
    expect(down[0]?.action).toEqual({ label: 'Reload', kind: 'reload' });
    expect(bannersOf(status({ workers: { ...INITIAL_STATUS.workers, layout: { state: 'down', started: true, reason: 'r' } } }))[0]?.text).toMatch(/layout worker stopped and gave up/);
    expect(
      ids(status({ workers: { ...INITIAL_STATUS.workers, search: { state: 'down', started: true, reason: 'r' } }, search: { ...INITIAL_STATUS.search, state: 'down', reason: 'r' } })),
    ).toEqual(['worker_down_search']);
  });

  it('an unavailable L4 without a chem banner still says "Check unavailable"', () => {
    expect(bannersOf(status({ l4: { state: 'unavailable', notChecked: 0, queued: 0, message: 'no chem worker' } }))[0]?.text).toBe('Check unavailable: no chem worker.');
  });
});

describe('bootLinesOf: one plain line each', () => {
  const none = { crashSuspected: false, editorSessions: 0, quarantinedRows: 0, assetsWithoutBytes: 0, unverifiedAssetBlobs: 0, migrationSteps: 0 };
  it('says nothing for a clean boot or no report', () => {
    expect(bootLinesOf(none)).toEqual([]);
    expect(bootLinesOf(null)).toEqual([]);
  });
  it('has a line for crashSuspected, quarantined rows, assets without bytes, unverified blobs, migration steps', () => {
    const lines = bootLinesOf({ crashSuspected: true, editorSessions: 1, quarantinedRows: 2, assetsWithoutBytes: 1, unverifiedAssetBlobs: 3, migrationSteps: 1 });
    expect(lines).toHaveLength(5);
    expect(lines[0]).toMatch(/crash is suspected/);
    expect(lines[1]).toBe('2 stored rows failed validation and were set aside (quarantined).');
    expect(lines[2]).toBe('1 asset record has no stored file.');
    expect(lines[3]).toBe('3 stored files were not verified.');
    expect(lines[4]).toBe('1 data migration step ran at start-up.');
  });
});

describe('saveTextOf and operationTextOf', () => {
  it.each([
    [null, /Not saved: this session keeps nothing/],
    [save({ state: 'saved', lastSavedRevision: 4 }), /^Saved \(revision 4\)$/],
    [save({ state: 'saving', pendingRevisions: 2 }), /^Applied, not saved yet: saving 2 changes$/],
    [save({ state: 'retrying', lastError: 'quota' }), /^Applied, not saved: retrying \(quota\)$/],
    [save({ state: 'failed', lastError: 'denied' }), /^Applied, NOT saved: saving failed \(denied\)$/],
    [save({ state: 'read_only' }), /^Read-only/],
  ])('%j', (value, text) => {
    expect(saveTextOf(status({ save: value }))).toMatch(text);
  });

  it('describes the running operation and its progress', () => {
    expect(operationTextOf(status({}))).toBeNull();
    expect(operationTextOf(status({ operation: { kind: 'import_apply', stage: 'snapshot', progress: { done: 3, total: 10 } } }))).toBe('Applying an import: snapshot, 3 of 10');
    expect(operationTextOf(status({ operation: { kind: 'export', stage: 'building', progress: null } }))).toBe('Exporting: building');
    expect(operationTextOf(status({ operation: { kind: 'restore', stage: 'reading', progress: { done: 1, total: null } } }))).toBe('Restoring a snapshot: reading, 1');
  });
});

describe('workersTextOf', () => {
  const worker = (state: 'absent' | 'ok' | 'restarting' | 'down', started: boolean) => ({ state, started, reason: 'r' });
  it('names the compute worker (the replica) and the three engine workers', () => {
    const healthy = status({
      replica: { state: 'in_sync', reason: '', revision: 1 },
      workers: { chem: worker('ok', true), layout: worker('ok', false), search: worker('ok', true) },
    });
    expect(workersTextOf(healthy)).toBe('Workers: compute ok, chem ok, layout not started, search ok');
  });

  it('says every other state in words', () => {
    const odd = status({
      replica: { state: 'down', reason: 'x', revision: null },
      workers: { chem: worker('restarting', true), layout: worker('absent', false), search: worker('down', true) },
    });
    expect(workersTextOf(odd)).toBe('Workers: compute down, chem restarting, layout absent, search down');
    expect(workersTextOf(status({ replica: { state: 'reloading', reason: '', revision: 1 }, workers: INITIAL_STATUS.workers }))).toMatch(/^Workers: compute reloading,/);
  });
});

describe('bannerKindOf', () => {
  it.each([
    ['follower', 'info'],
    ['storage_asking', 'info'],
    ['session_only', 'warning'],
    ['worker_down_chem', 'warning'],
    ['revision_gap', 'error'],
    ['reload_failure', 'error'],
    ['l4_not_checked', 'review'],
  ] as const)('%s is a %s notice', (id, kind) => {
    expect(bannerKindOf(id)).toBe(kind);
  });

  it('every banner a status can produce has a kind of its own; an unknown id is a warning, never hidden', () => {
    const all = status({
      mode: 'session_only',
      reason: 'x',
      singleTab: true,
      replica: { state: 'down', reason: 'r', revision: null },
      validation: { where: 'main', reason: 'r' },
      reloadFailure: { reason: 'r', detail: 'd' },
      rejectedRows: 1,
      workers: { chem: { state: 'down', started: true, reason: 'r' }, layout: { state: 'down', started: true, reason: 'r' }, search: { state: 'down', started: true, reason: 'r' } },
      l4: { state: 'idle', notChecked: 2, queued: 0, message: 'm' },
      storage: { persistence: 'refused', message: null },
      save: save({ failureReason: 'revision_gap', lastError: 'gap' }),
    });
    const produced = ids(all);
    expect(produced.length).toBeGreaterThanOrEqual(10);
    for (const id of produced) expect(['info', 'warning', 'error', 'review']).toContain(bannerKindOf(id));
    expect(bannerKindOf('some_future_banner')).toBe('warning');
  });
});
