/**
 * Boot step 4 (docs/PERSISTENCE.md §4): stored rows → per-record L1 → state. A row that fails L1 is left out of the
 * state and MOVED to quarantine by the writer (`records` must always equal the in-memory state): the quarantine row
 * holds the issues and the FULL raw value, exactly as stored, so nothing is lost (INV-23). Pure: no IndexedDB.
 */
import { freeze } from 'immer';
import { hash64 } from '@/core/hash';
import { emptyRecordTables, type AnyRecord, type CanonicalState, type DatasetMeta, type JsonValue, type RecordKind } from '@/core/schema';
import { validator } from '@/core/validation';
import type { Finding } from '@/core/validation/contracts';
import { isJsonValue } from './json-value';
import type { QuarantineRow } from './contracts';

const MAX_ISSUES_PER_ROW = 20;

export const issueOf = (finding: Finding): string => `${finding.path ?? '(record)'}: ${finding.message}`;

/** Deterministic ID: the same row is one quarantine row, not one per attempt. */
export const quarantineIdOf = (rowId: unknown): string => `qtn_boot-${hash64(String(rowId))}`;

export function quarantineRow(row: unknown, issues: readonly string[], createdAt: string): QuarantineRow {
  const kind = typeof row === 'object' && row !== null ? (row as { kind?: unknown }).kind : undefined;
  const id = typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined;
  const shown = issues.slice(0, MAX_ISSUES_PER_ROW);
  if (issues.length > shown.length) shown.push(`… and ${issues.length - shown.length} more issue(s)`);
  // IndexedDB keeps more than JSON (a Date, NaN, undefined): the value is stored as it is, and the issue list says so.
  if (!isJsonValue(row)) shown.push('the stored value is not plain JSON (or is very large or deep); it is kept exactly as stored');
  return {
    id: quarantineIdOf(id),
    createdAt,
    source: 'boot_integrity',
    ...(typeof kind === 'string' ? { claimedKind: kind.slice(0, 80) } : {}),
    raw: row as JsonValue,
    issues: shown,
  };
}

/** A row left out of the state: what to delete from `records` (its key) and what to keep instead. */
export interface RejectedRow {
  readonly recordKey: unknown;
  readonly quarantine: QuarantineRow;
}

export interface AssembledState {
  readonly state: CanonicalState;
  /** One per row left out of the state. */
  readonly rejected: readonly RejectedRow[];
}

export function assembleState(rows: readonly unknown[], meta: DatasetMeta, createdAt: string): AssembledState {
  const tables = emptyRecordTables() as unknown as Record<RecordKind, Record<string, AnyRecord>>;
  const rejected: RejectedRow[] = [];
  for (const row of rows) {
    const kind = typeof row === 'object' && row !== null ? (row as { kind?: unknown }).kind : undefined;
    const parsed = validator.parseRecord(kind as RecordKind, row);
    if (!parsed.ok) {
      const recordKey = typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined;
      rejected.push({ recordKey, quarantine: quarantineRow(row, parsed.findings.map(issueOf), createdAt) });
      continue;
    }
    (tables[parsed.record.kind] as Record<string, AnyRecord>)[parsed.record.id] = parsed.record;
  }
  return { state: freeze({ meta, records: tables } as unknown as CanonicalState, true), rejected };
}
