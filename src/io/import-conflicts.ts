/**
 * ID conflict analysis (docs/PERSISTENCE.md §6, IMPLEMENTATION_PLAN.md step 3.7): every incoming record is compared with the
 * live record of the same ID. `identical` is decided per record by canonical deep equality (`canonical-json.ts`), never by name
 * or ID. A record that repeats an ID already seen earlier in the SAME file keeps its first occurrence and the repeat goes to the
 * quarantine list with a reason (never silently dropped, never last-wins). Pure: reads `live` and `parsed`, changes nothing.
 */
import { compareIds } from '@/core/dataset';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind } from '@/core/schema';
import { canonicalJson } from './canonical-json';
import type { ImportParseResult, QuarantinedItem } from './contracts';
import { quarantineRaw } from './import-envelope';

export interface ConflictEntry {
  readonly incoming: AnyRecord;
  readonly live: AnyRecord;
  readonly identical: boolean;
}

export interface KindCounts {
  incoming: number;
  new: number;
  identical: number;
  conflicting: number;
}

export interface ConflictAnalysis {
  /** Incoming records after removing in-file repeats: kind order, then ID. */
  readonly incoming: readonly AnyRecord[];
  /** Repeats of an ID already seen in the file, as quarantine items. */
  readonly duplicates: readonly QuarantinedItem[];
  /** Incoming records whose ID exists live, same order as `incoming`. */
  readonly conflicts: readonly ConflictEntry[];
  readonly counts: Readonly<Partial<Record<RecordKind, KindCounts>>>;
}

export function analyzeConflicts(live: CanonicalState, parsed: ImportParseResult): ConflictAnalysis {
  const seen = new Set<string>();
  const kept: AnyRecord[] = [];
  const duplicates: QuarantinedItem[] = [];
  for (const kind of RECORD_KINDS) {
    for (const record of parsed.records[kind] ?? []) {
      if (seen.has(record.id)) {
        duplicates.push({
          claimedKind: record.kind,
          claimedId: record.id,
          issues: ['repeats an ID that appears earlier in the same file: the first occurrence is kept, this one is not imported'],
          ...quarantineRaw(record),
        });
        continue;
      }
      seen.add(record.id);
      kept.push(record);
    }
  }
  const order = new Map<RecordKind, number>(RECORD_KINDS.map((kind, index) => [kind, index]));
  kept.sort((a, b) => (order.get(a.kind) as number) - (order.get(b.kind) as number) || compareIds(a.id, b.id));

  const conflicts: ConflictEntry[] = [];
  const counts: Partial<Record<RecordKind, KindCounts>> = {};
  for (const record of kept) {
    const table = live.records[record.kind] as Readonly<Record<string, AnyRecord>>;
    const entry = (counts[record.kind] ??= { incoming: 0, new: 0, identical: 0, conflicting: 0 });
    entry.incoming += 1;
    const liveRecord = Object.hasOwn(table, record.id) ? table[record.id] : undefined;
    if (liveRecord === undefined) {
      entry.new += 1;
      continue;
    }
    const left = canonicalJson(record);
    const identical = left !== undefined && left === canonicalJson(liveRecord);
    if (identical) entry.identical += 1;
    else entry.conflicting += 1;
    conflicts.push({ incoming: record, live: liveRecord, identical });
  }
  return { incoming: kept, duplicates, conflicts, counts };
}
