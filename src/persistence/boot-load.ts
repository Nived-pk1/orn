/**
 * Boot step 4 (docs/PERSISTENCE.md §4): stored rows → per-record L1 → state. A row that fails L1 is left out of the
 * state and described by a quarantine row (issues + the raw value, capped); the row itself is NOT deleted, so
 * nothing is lost and Diagnostics can still offer export or repair (INV-23). Pure: no IndexedDB.
 */
import { freeze } from 'immer';
import { hash64 } from '@/core/hash';
import { emptyRecordTables, type AnyRecord, type CanonicalState, type DatasetMeta, type JsonValue, type RecordKind } from '@/core/schema';
import { validator } from '@/core/validation';
import type { Finding } from '@/core/validation/contracts';
import { QUARANTINE_RAW_MAX_CHARS, type QuarantineRow } from './contracts';

const MAX_ISSUES_PER_ROW = 20;

export function capRaw(value: unknown): { readonly raw: JsonValue; readonly rawTruncated?: { readonly originalChars: number }; readonly note?: string } {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch {
    text = undefined;
  }
  if (text === undefined) return { raw: '[not representable as JSON]', note: 'the stored value cannot be represented as JSON, so no raw copy is kept here; the row itself is untouched' };
  if (text.length <= QUARANTINE_RAW_MAX_CHARS) return { raw: JSON.parse(text) as JsonValue };
  return { raw: text.slice(0, QUARANTINE_RAW_MAX_CHARS), rawTruncated: { originalChars: text.length } };
}

const issueOf = (finding: Finding): string => `${finding.path ?? '(record)'}: ${finding.message}`;

/** Deterministic ID: the same row quarantined at every boot is one quarantine row, not one per boot. */
export const quarantineIdOf = (rowId: unknown): string => `qtn_boot-${hash64(String(rowId))}`;

export function quarantineRow(row: unknown, issues: readonly string[], createdAt: string): QuarantineRow {
  const kind = typeof row === 'object' && row !== null ? (row as { kind?: unknown }).kind : undefined;
  const id = typeof row === 'object' && row !== null ? (row as { id?: unknown }).id : undefined;
  const capped = capRaw(row);
  const shown = issues.slice(0, MAX_ISSUES_PER_ROW);
  if (issues.length > shown.length) shown.push(`… and ${issues.length - shown.length} more issue(s)`);
  if (capped.note !== undefined) shown.push(capped.note);
  return {
    id: quarantineIdOf(id),
    createdAt,
    source: 'boot_integrity',
    ...(typeof kind === 'string' ? { claimedKind: kind.slice(0, 80) } : {}),
    raw: capped.raw,
    ...(capped.rawTruncated !== undefined ? { rawTruncated: capped.rawTruncated } : {}),
    issues: shown,
  };
}

export interface AssembledState {
  readonly state: CanonicalState;
  /** One per row left out of the state. */
  readonly rejected: readonly QuarantineRow[];
}

export function assembleState(rows: readonly unknown[], meta: DatasetMeta, createdAt: string): AssembledState {
  const tables = emptyRecordTables() as unknown as Record<RecordKind, Record<string, AnyRecord>>;
  const rejected: QuarantineRow[] = [];
  for (const row of rows) {
    const kind = typeof row === 'object' && row !== null ? (row as { kind?: unknown }).kind : undefined;
    const parsed = validator.parseRecord(kind as RecordKind, row);
    if (!parsed.ok) {
      rejected.push(quarantineRow(row, parsed.findings.map(issueOf), createdAt));
      continue;
    }
    (tables[parsed.record.kind] as Record<string, AnyRecord>)[parsed.record.id] = parsed.record;
  }
  return { state: freeze({ meta, records: tables } as unknown as CanonicalState, true), rejected };
}
