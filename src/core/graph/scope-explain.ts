/**
 * Why a record has the exam scope it has under one exam version (step 5.6b; JEE_ONTOLOGY §4). The scope itself is `createScopeOf`'s
 * answer; this adds the reason in data (an explicit override, or the topics it is mapped to with the version's coverage of each), so a
 * view can say it in words. Pure, derived, never stored.
 */
import type { ExamRelevance, ExamScope, ExamVersion, RecordRef, TopicMapping } from '../schema';
import type { ReadonlyIndexes } from '../indexes/contracts';
import { referencing } from './kit';
import { createScopeOf, explicitOverride } from './scope';

export interface ScopeTopic {
  readonly topicId: string;
  /** The version's coverage of this topic, or `not listed` when no unit of the version lists it. */
  readonly coverage: 'included' | 'partial' | 'excluded' | 'not listed';
  /** True for a topic the record is mapped to; false for an ancestor of one. */
  readonly mapped: boolean;
}

export interface ScopeExplanation {
  readonly scope: ExamScope | 'unmapped';
  /** override: an exam_relevance record decided; mapped: the topic mappings decided; prerequisite: a prerequisite of an official record; unmapped: nothing speaks for it. */
  readonly reason: 'override' | 'mapped' | 'prerequisite' | 'unmapped';
  readonly overrideIds: readonly string[];
  readonly mappingIds: readonly string[];
  readonly topics: readonly ScopeTopic[];
}

export function explainScope(indexes: ReadonlyIndexes, ref: RecordRef, version: ExamVersion): ScopeExplanation {
  const scope = createScopeOf(indexes, version.examId, version.id)(ref);
  const overrides = referencing(indexes, ref, 'target', 'exam_relevance')
    .map((owner) => indexes.get(owner.id))
    .filter((r): r is ExamRelevance => r?.kind === 'exam_relevance' && r.examId === version.examId);
  const mappings = referencing(indexes, ref, 'target', 'topic_mapping')
    .map((owner) => indexes.get(owner.id))
    .filter((m): m is TopicMapping => m?.kind === 'topic_mapping');
  const coverage = new Map<string, 'included' | 'partial' | 'excluded'>();
  for (const unit of version.units) for (const tc of unit.topicCoverage) coverage.set(tc.topicId, tc.coverage);
  const topics: ScopeTopic[] = [];
  const seen = new Set<string>();
  const add = (topicId: string, mapped: boolean): void => {
    if (seen.has(topicId)) return;
    seen.add(topicId);
    topics.push({ topicId, coverage: coverage.get(topicId) ?? 'not listed', mapped });
  };
  for (const m of mappings) add(m.topicId, true);
  for (const m of mappings) for (const ancestor of indexes.ancestorsOf('topic', m.topicId)) add(ancestor, false);
  const overridden = explicitOverride(indexes, ref, version.examId, version.id) !== undefined;
  const reason: ScopeExplanation['reason'] = overridden ? 'override' : mappings.length > 0 ? 'mapped' : scope === 'prerequisite' ? 'prerequisite' : 'unmapped';
  const applicable = overrides.filter((r) => r.examVersionIds.includes(version.id) || r.examVersionIds.length === 0);
  return {
    scope,
    reason,
    overrideIds: applicable.map((r) => r.id).sort(),
    mappingIds: mappings.map((m) => m.id).sort(),
    topics,
  };
}
