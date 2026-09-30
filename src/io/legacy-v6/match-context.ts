/**
 * The LIVE dataset as the legacy mapper sees it (step 3.11b, docs/MIGRATION.md §4.5): plain, read-only data listing the concepts,
 * named reactions, topics and exams a legacy text may be matched against. Matching by folded name or alias reuses a record that
 * already exists; nothing else about the dataset is visible, and the mapper never writes to it. The context is an INPUT: the same
 * document and the same context give the same output, and an empty context (the default) gives the output of a fresh dataset.
 *
 * `createMatchIndex` turns the list into Maps once (a lookup is O(1)); candidates for one name are ordered by record ID, so the
 * result does not depend on the order the context lists its records in.
 */
import { fold } from '@/core/text';
import type { AnyRecord, Concept } from '@/core/schema';

export type ConceptKind = Concept['conceptKind'];

export type MatchKind = 'concept' | 'named_reaction' | 'topic' | 'exam';

export interface MatchRecord {
  readonly id: string;
  readonly kind: MatchKind;
  /** Folded names and aliases (`fold`); a record without any is never matched. */
  readonly names: readonly string[];
  /** Topics only: the parent topic (the tie-breaker between two topics of one name). */
  readonly parentId?: string;
  /** Concepts only: `conceptKind`. */
  readonly conceptKind?: ConceptKind;
}

export interface LegacyMatchContext {
  readonly records: readonly MatchRecord[];
}

export const EMPTY_MATCH_CONTEXT: LegacyMatchContext = { records: [] };

/** The context a live dataset gives: its concepts, named reactions, topics and exams, names folded. Other kinds are ignored. */
export function matchContextFromRecords(records: Iterable<AnyRecord>): LegacyMatchContext {
  const out: MatchRecord[] = [];
  for (const record of records) {
    switch (record.kind) {
      case 'concept':
        out.push({ id: record.id, kind: 'concept', names: [record.name, ...record.aliases].map(fold), conceptKind: record.conceptKind });
        break;
      case 'named_reaction':
        out.push({ id: record.id, kind: 'named_reaction', names: [record.name, ...record.aliases].map(fold) });
        break;
      case 'topic':
        out.push({ id: record.id, kind: 'topic', names: [record.name, ...record.aliases].map(fold), ...(record.parentId === undefined ? {} : { parentId: record.parentId }) });
        break;
      case 'exam':
        out.push({ id: record.id, kind: 'exam', names: [fold(record.name)] });
        break;
      default:
        break;
    }
  }
  return { records: out };
}

export interface MatchIndex {
  /** Every record of `kind` whose folded names include `folded`, by ID. */
  find(kind: MatchKind, folded: string): readonly MatchRecord[];
}

const byId = (a: MatchRecord, b: MatchRecord): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createMatchIndex(context: LegacyMatchContext): MatchIndex {
  const table = new Map<string, MatchRecord[]>();
  for (const record of context.records) {
    for (const name of new Set(record.names)) {
      const key = `${record.kind}\u0000${name}`;
      const list = table.get(key);
      if (list === undefined) table.set(key, [record]);
      else list.push(record);
    }
  }
  for (const list of table.values()) list.sort(byId);
  return { find: (kind, folded) => table.get(`${kind}\u0000${folded}`) ?? [] };
}
