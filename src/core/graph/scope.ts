/**
 * Derived exam scope (docs/JEE_ONTOLOGY.md §4). Pure and reused-index-backed: every lookup goes through
 * `referrersOf`/`topicsOf`/`ancestorsOf`/`relationshipsOf` (already maintained incrementally), never a
 * full-table scan — `topic_mapping.target` and `exam_relevance.target` are registered references, so
 * "which mappings/overrides point at this record" is exactly `referrersOf(ref.id)` filtered by path.
 */
import type {
  ExamId,
  ExamRelevance,
  ExamScope,
  ExamVersion,
  ExamVersionId,
  RecordRef,
  Relationship,
  TopicMapping,
} from '../schema';
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { ProjectionContext } from './contracts';
import { coverageOfTopic, strongestCoverage } from '../coverage';
import { referencing } from './kit';

export type ScopeOf = ProjectionContext['scopeOf'];

/** Highest-precedence scope wins: official > prerequisite > enrichment > outside (JEE_ONTOLOGY.md §4.1, CUR-004). */
const PRECEDENCE: Readonly<Record<ExamScope, number>> = { official: 0, prerequisite: 1, enrichment: 2, outside: 3 };
const bestOf = (scopes: readonly ExamScope[]): ExamScope => [...scopes].sort((a, b) => PRECEDENCE[a] - PRECEDENCE[b])[0] as ExamScope;

/** §4.1: explicit `exam_relevance` override. Version-specific entries win over version-agnostic ones. */
export function explicitOverride(indexes: ReadonlyIndexes, ref: RecordRef, examId: ExamId, examVersionId: ExamVersionId): ExamScope | undefined {
  const relevances = referencing(indexes, ref, 'target', 'exam_relevance')
    .map((owner) => indexes.get(owner.id))
    .filter((r): r is ExamRelevance => r?.kind === 'exam_relevance' && r.examId === examId);
  if (relevances.length === 0) return undefined;
  const versionSpecific = relevances.filter((r) => r.examVersionIds.includes(examVersionId));
  const applicable = versionSpecific.length > 0 ? versionSpecific : relevances.filter((r) => r.examVersionIds.length === 0);
  return applicable.length === 0 ? undefined : bestOf(applicable.map((r) => r.scope));
}

/** §4.2: each topic `ref` maps to is checked against `examVersion` by the ONE coverage rule (`coverage/topic-coverage.ts`, 7.7 A). */
export function mappedScope(indexes: ReadonlyIndexes, examVersion: ExamVersion, ref: RecordRef): ExamScope | undefined {
  const mappings = referencing(indexes, ref, 'target', 'topic_mapping')
    .map((owner) => indexes.get(owner.id))
    .filter((m): m is TopicMapping => m?.kind === 'topic_mapping');
  if (mappings.length === 0) return undefined;
  const strongest = strongestCoverage(examVersion);
  const parentOf = (id: string): string | undefined => {
    const t = indexes.get(id);
    return t?.kind === 'topic' ? t.parentId : undefined;
  };
  const covered = mappings.some((m) => {
    const level = coverageOfTopic(strongest, m.topicId, parentOf);
    return level === 'included' || level === 'partial';
  });
  if (covered) return mappings.every((m) => m.role === 'enrichment') ? 'enrichment' : 'official';
  return 'outside';
}

/** §4.3: an unmapped/outside concept that is a prerequisite (one hop) of a record whose *direct* scope is official. */
function prerequisiteScope(indexes: ReadonlyIndexes, ref: RecordRef, direct: (r: RecordRef) => ExamScope | undefined): ExamScope | undefined {
  if (ref.kind !== 'concept') return undefined;
  const viaField = [
    ...referencing(indexes, ref, 'prerequisiteConceptIds[]', 'reaction'),
    ...referencing(indexes, ref, 'prerequisiteConceptIds[]', 'named_reaction'),
  ];
  const viaRelationship = indexes
    .relationshipsOf(ref)
    .map((owner) => indexes.get(owner.id))
    .filter((r): r is Relationship => r?.kind === 'relationship' && r.type === 'prerequisite_of' && r.from.id === ref.id)
    .map((r) => r.to);
  return [...viaField, ...viaRelationship].some((candidate) => direct(candidate) === 'official') ? 'prerequisite' : undefined;
}

/**
 * Builds a `scopeOf` for one exam version (JEE_ONTOLOGY.md §4). `examVersionId` must resolve to an
 * `exam_version` record; otherwise every record is `unmapped` (an override can never assert scope under a
 * version that does not exist, and there is no coverage to check).
 */
export function createScopeOf(indexes: ReadonlyIndexes, examId: ExamId, examVersionId: ExamVersionId): ScopeOf {
  const examVersion = indexes.get(examVersionId);
  const version = examVersion?.kind === 'exam_version' ? examVersion : undefined;
  const direct = (ref: RecordRef): ExamScope | undefined =>
    explicitOverride(indexes, ref, examId, examVersionId) ?? (version === undefined ? undefined : mappedScope(indexes, version, ref));
  return (ref) => direct(ref) ?? prerequisiteScope(indexes, ref, direct) ?? 'unmapped';
}
