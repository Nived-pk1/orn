/**
 * Minimal curriculum-layer builders for tests (docs/JEE_ONTOLOGY.md): topics, exam versions, topic
 * mappings, exam relevance overrides, and the two relationship kinds used across graph tests
 * (`reverse_of`, `prerequisite_of`). Not tied to the demo's fixed topic list.
 */
import type { CoverageLevel, Exam, ExamRelevance, ExamScope, ExamVersion, RecordRef, Relationship, Topic, TopicMapping } from '@/core/schema';
import { ident, meta, type CurationOptions } from './demo/kit';

export const topicId = (body: string) => ident<Topic['id']>('top', body);
export const examId = (body: string) => ident<Exam['id']>('exm', body);
export const examVersionId = (body: string) => ident<ExamVersion['id']>('exv', body);

export function topic(body: string, name: string, o: { readonly kind?: Topic['topicKind']; readonly parent?: string; readonly order?: number } = {}): Topic {
  return {
    id: topicId(body),
    kind: 'topic',
    name,
    aliases: [],
    ...(o.parent === undefined ? {} : { parentId: topicId(o.parent) }),
    topicKind: o.kind ?? 'chapter',
    order: o.order ?? 1,
    ...meta(),
  };
}

export function examVersion(
  body: string,
  examBody: string,
  coverage: readonly { readonly topic: string; readonly coverage: CoverageLevel }[],
  o: { readonly status?: ExamVersion['status'] } = {},
): ExamVersion {
  return {
    id: examVersionId(body),
    kind: 'exam_version',
    examId: examId(examBody),
    label: body,
    status: o.status ?? 'provisional',
    units: [
      {
        id: ident<ExamVersion['units'][number]['id']>('unt', `${body}-u1`),
        title: 'Unit',
        topicCoverage: coverage.map((c) => ({ topicId: topicId(c.topic), coverage: c.coverage })),
      },
    ],
    ...meta(),
  };
}

export function topicMapping(body: string, topicBody: string, target: RecordRef, role: TopicMapping['role'] = 'core'): TopicMapping {
  return { id: ident<TopicMapping['id']>('tmp', body), kind: 'topic_mapping', topicId: topicId(topicBody), target, role, ...meta() };
}

export function examRelevance(
  body: string,
  target: RecordRef,
  examBody: string,
  versionBodies: readonly string[],
  scope: ExamScope,
  o: CurationOptions = {},
): ExamRelevance {
  return {
    id: ident<ExamRelevance['id']>('erl', body),
    kind: 'exam_relevance',
    target,
    examId: examId(examBody),
    examVersionIds: versionBodies.map(examVersionId),
    scope,
    ...meta(o),
  };
}

export function reverseOf(body: string, from: RecordRef, to: RecordRef, reverseKind: NonNullable<Relationship['reverseKind']> = 'synthetic'): Relationship {
  return { id: ident<Relationship['id']>('rel', body), kind: 'relationship', type: 'reverse_of', from, to, reverseKind, ...meta() };
}

export function prerequisiteOf(body: string, prerequisite: RecordRef, dependent: RecordRef): Relationship {
  return { id: ident<Relationship['id']>('rel', body), kind: 'relationship', type: 'prerequisite_of', from: prerequisite, to: dependent, ...meta() };
}
