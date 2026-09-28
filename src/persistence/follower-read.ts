/**
 * What a follower tab reads from storage (ADR-033). A follower never writes: it has no quarantine, no markers, no
 * migration. A row that fails L1 is REPORTED and left out; only the writer (boot, promotion) moves it to quarantine.
 */
import { DatasetMetaSchema, type CanonicalState } from '@/core/schema';
import { assembleState } from './boot-load';
import type { CommittedData } from './boot-ports';

/** The rows for the IDs a message named, read with the revision and meta in ONE read transaction. */
export interface ChangedRows {
  /** Aligned with the requested IDs; `undefined` where the row does not exist (it was deleted). */
  readonly rows: readonly unknown[];
  readonly revision: unknown;
  readonly schemaVersion: unknown;
  readonly datasetMeta: unknown;
}

export interface RejectedRowReport {
  readonly id: string;
  readonly issues: readonly string[];
}

export type FollowerLoadFailure = 'empty' | 'newer_schema' | 'needs_migration' | 'integrity_failure';

export type FollowerLoad =
  | { readonly ok: true; readonly state: CanonicalState; readonly revision: number; readonly rejected: readonly RejectedRowReport[] }
  | { readonly ok: false; readonly reason: FollowerLoadFailure; readonly detail: string };

const isRevision = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** A full read as a follower sees it: only the current schema version loads; anything else waits for the writer. */
export function interpretCommitted(committed: CommittedData, targetVersion: number, createdAt: string): FollowerLoad {
  const { rows, meta } = committed;
  const stored = meta.schemaVersion;
  if (rows.length === 0 && stored === undefined && meta.datasetMeta === undefined && meta.revision === undefined) {
    return { ok: false, reason: 'empty', detail: 'nothing is stored yet' };
  }
  if (typeof stored === 'number' && Number.isInteger(stored) && stored > targetVersion) {
    return { ok: false, reason: 'newer_schema', detail: `the stored data is schema version ${stored}; this app supports up to ${targetVersion}` };
  }
  if (stored !== targetVersion) {
    return { ok: false, reason: 'needs_migration', detail: `the stored data is schema version ${String(stored)}; only the writer tab may migrate it` };
  }
  if (!isRevision(meta.revision)) return { ok: false, reason: 'integrity_failure', detail: `the stored revision is not a non-negative integer (${JSON.stringify(meta.revision)})` };
  const datasetMeta = DatasetMetaSchema.safeParse(meta.datasetMeta);
  if (!datasetMeta.success) return { ok: false, reason: 'integrity_failure', detail: 'the stored dataset meta is missing or invalid' };
  const assembled = assembleState(rows, datasetMeta.data, createdAt);
  return {
    ok: true,
    state: assembled.state,
    revision: meta.revision,
    rejected: assembled.rejected.map((r) => ({ id: String(r.recordKey), issues: r.quarantine.issues })),
  };
}
