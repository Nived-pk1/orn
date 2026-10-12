import { describe, expect, it } from 'vitest';
import type { BootReport, OpenResult } from '@/persistence';
import { createIdFactory } from '@/core/dataset';
import { DatasetMetaSchema } from '@/core/schema';
import { decideMode, emptyState, noticesOf } from './boot';

const readOnly = (readOnlyReason: 'other_tab_is_writer' | 'newer_schema' | 'integrity_failure' | 'migration_failed', detail?: string): OpenResult => ({
  mode: 'read_only',
  readOnlyReason,
  ...(detail === undefined ? {} : { detail }),
  state: null,
  revision: 0,
  storedSchemaVersion: null,
  quarantinedCount: 0,
});

describe('decideMode: OpenResult -> what the app is', () => {
  const rows: readonly [string, OpenResult, { mode: string; reason: string | null }][] = [
    ['read_write', { mode: 'read_write', state: null, revision: 0, storedSchemaVersion: null, quarantinedCount: 0 }, { mode: 'writer', reason: null }],
    ['other tab is the writer', readOnly('other_tab_is_writer'), { mode: 'follower', reason: 'other_tab_is_writer' }],
    ['newer schema', readOnly('newer_schema', 'saved by a newer version'), { mode: 'read_only', reason: 'newer_schema' }],
    ['integrity failure', readOnly('integrity_failure', 'meta damaged'), { mode: 'read_only', reason: 'integrity_failure' }],
    ['migration failed', readOnly('migration_failed', 'step 1 threw'), { mode: 'read_only', reason: 'migration_failed' }],
    ['read-only without a reason', { mode: 'read_only', state: null, revision: 0, storedSchemaVersion: null, quarantinedCount: 0 }, { mode: 'read_only', reason: 'read_only' }],
    ['unavailable (blocked)', { mode: 'unavailable', reason: 'indexeddb_blocked', detail: 'blocked' }, { mode: 'session_only', reason: 'indexeddb_blocked' }],
    ['unavailable (private mode)', { mode: 'unavailable', reason: 'private_mode_quota', detail: 'quota 0' }, { mode: 'session_only', reason: 'private_mode_quota' }],
    ['unavailable (Blob storage refused)', { mode: 'unavailable', reason: 'blob_storage_refused', detail: 'no blobs' }, { mode: 'session_only', reason: 'blob_storage_refused' }],
    ['unavailable (unknown)', { mode: 'unavailable', reason: 'unknown', detail: 'nope' }, { mode: 'session_only', reason: 'unknown' }],
  ];
  it.each(rows)('%s', (_name, opened, expected) => {
    expect(decideMode(opened)).toMatchObject(expected);
  });

  it('keeps the detail', () => {
    expect(decideMode(readOnly('newer_schema', 'saved by a newer version')).detail).toBe('saved by a newer version');
    expect(decideMode({ mode: 'unavailable', reason: 'unknown', detail: 'nope' }).detail).toBe('nope');
  });
});

describe('emptyState', () => {
  it('is a valid, empty dataset with ids and times from the injected factory', () => {
    let ms = 1_790_000_000_000;
    const ids = createIdFactory({ nowMs: () => (ms += 1) }, { next: () => 0.25 });
    const state = emptyState(ids);
    expect(DatasetMetaSchema.safeParse(state.meta).success).toBe(true);
    expect(Object.values(state.records).every((table) => Object.keys(table).length === 0)).toBe(true);
    expect(emptyState(ids).meta.datasetId).not.toBe(state.meta.datasetId);
  });
});

describe('noticesOf', () => {
  it('counts what boot found', () => {
    const report = {
      migrationSteps: [{}, {}],
      findings: [],
      validation: { where: 'worker', reason: '' },
      assetIdsWithoutBlob: ['ast_a'],
      unverifiedAssetBlobs: [{}, {}, {}],
      crashSuspected: true,
      editorSessionIds: ['eds_a', 'eds_b'],
      uiState: {},
      uiStateReset: [],
      newlyQuarantined: 4,
      singleTab: false,
    } as unknown as BootReport;
    expect(noticesOf(report)).toEqual({ crashSuspected: true, editorSessions: 2, quarantinedRows: 4, assetsWithoutBytes: 1, unverifiedAssetBlobs: 3, migrationSteps: 2 });
  });
});
