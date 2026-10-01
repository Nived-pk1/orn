/**
 * What the pure document builder reads besides the record itself (step 4.5): the exam versions with their derived scope
 * (`createScopeOf` from core, JEE_ONTOLOGY §4), the topics that map to a record, and a reagent's families. Built from the store's
 * state and indexes; nothing here is stored (INV-11): ranks and topic lists are derived data of a document, rebuilt when what they
 * read changes (`src/workers/search/fanout.ts` says when).
 */
import { createScopeOf } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, ExamScope, RecordRef, Reagent } from '@/core/schema';

export interface ExamVersionScope {
  readonly id: string;
  readonly scopeOf: (ref: RecordRef) => ExamScope | 'unmapped';
}

export interface DocumentPorts {
  /** Every exam version of the dataset, sorted by id. */
  readonly versions: readonly ExamVersionScope[];
  /** Topics mapped to the record, with their ancestors; a topic: itself and its ancestors. Sorted, distinct. */
  topicIdsOf(ref: RecordRef): readonly string[];
  /** The record as a reagent, when the id is one (a reaction's participant). */
  reagentOf(id: string): Reagent | undefined;
}

export function documentPortsOf(state: CanonicalState, indexes: ReadonlyIndexes): DocumentPorts {
  const versions = Object.values(state.records.exam_version)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((version) => ({ id: version.id, scopeOf: createScopeOf(indexes, version.examId, version.id) }));
  return {
    versions,
    topicIdsOf(ref) {
      const own = ref.kind === 'topic' ? [ref.id] : indexes.topicsOf(ref);
      const all = new Set<string>();
      for (const id of own) {
        all.add(id);
        for (const ancestor of indexes.ancestorsOf('topic', id)) all.add(ancestor);
      }
      return [...all].sort();
    },
    reagentOf(id) {
      const record = indexes.get(id);
      return record?.kind === 'reagent' ? record : undefined;
    },
  };
}
