/**
 * Curriculum layer — docs/JEE_ONTOLOGY.md and docs/DOMAIN_MODEL.md §9.
 * Topics are a version-independent subject tree. Exam versions declare which topics their units cover.
 * Records are placed into topics by TopicMapping (many-to-many). Exam scope of a record is DERIVED
 * from mappings + coverage, with ExamRelevance as an explicit override. Chemistry records never
 * reference exams or topics (layering, INV-29).
 */
import { z } from 'zod';
import { ExamIdSchema, ExamRelevanceIdSchema, ExamVersionIdSchema, SyllabusUnitIdSchema, TopicIdSchema, TopicMappingIdSchema } from './ids';
import {
  FiniteNumberSchema,
  IsoDateSchema,
  LabelTextSchema,
  LIMITS,
  NameTextSchema,
  recordMetaShape,
  RichTextSchema,
  ShortTextSchema,
} from './primitives';
import { RecordRefSchema } from './refs';

export const ExamSchema = z.strictObject({
  id: ExamIdSchema,
  kind: z.literal('exam'),
  name: NameTextSchema,
  shortName: LabelTextSchema.optional(),
  authority: LabelTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Exam = z.infer<typeof ExamSchema>;

export const COVERAGE_LEVELS = ['included', 'partial', 'excluded'] as const;
export type CoverageLevel = (typeof COVERAGE_LEVELS)[number];

export const TopicCoverageSchema = z.strictObject({
  topicId: TopicIdSchema,
  coverage: z.enum(COVERAGE_LEVELS),
  note: ShortTextSchema.optional(),
});

export const SyllabusUnitSchema = z.strictObject({
  id: SyllabusUnitIdSchema,
  code: LabelTextSchema.optional(),
  /** Version-specific title, e.g. "Organic compounds containing oxygen". */
  title: NameTextSchema,
  /** Official wording as published, when the user records it. */
  officialText: RichTextSchema.optional(),
  topicCoverage: z.array(TopicCoverageSchema).max(LIMITS.topicCoverage),
});

export const EXAM_VERSION_STATUS = ['official', 'provisional', 'draft'] as const;

export const ExamVersionSchema = z.strictObject({
  id: ExamVersionIdSchema,
  kind: z.literal('exam_version'),
  examId: ExamIdSchema,
  label: LabelTextSchema,
  year: z.number().int().min(1900).max(2200).optional(),
  /** "official" only when verified against the published syllabus document (cite it). */
  status: z.enum(EXAM_VERSION_STATUS),
  effectiveFrom: IsoDateSchema.optional(),
  effectiveTo: IsoDateSchema.optional(),
  units: z.array(SyllabusUnitSchema).max(LIMITS.syllabusUnits),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type ExamVersion = z.infer<typeof ExamVersionSchema>;

export const TOPIC_KINDS = ['subject', 'chapter', 'section', 'topic', 'subtopic'] as const;

export const TopicSchema = z.strictObject({
  id: TopicIdSchema,
  kind: z.literal('topic'),
  name: NameTextSchema,
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  /** Tree (HIER-001). */
  parentId: TopicIdSchema.optional(),
  topicKind: z.enum(TOPIC_KINDS),
  /** Sibling order. Fractional values allow insertion without renumbering. */
  order: FiniteNumberSchema,
  summary: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Topic = z.infer<typeof TopicSchema>;

export const MAPPING_ROLES = ['core', 'supporting', 'enrichment'] as const;

/** Places any chemistry/knowledge record into a topic. A record may map to many topics (cross-chapter). */
export const TopicMappingSchema = z.strictObject({
  id: TopicMappingIdSchema,
  kind: z.literal('topic_mapping'),
  topicId: TopicIdSchema,
  target: RecordRefSchema,
  role: z.enum(MAPPING_ROLES),
  note: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type TopicMapping = z.infer<typeof TopicMappingSchema>;

export const EXAM_SCOPES = ['official', 'prerequisite', 'enrichment', 'outside'] as const;
export type ExamScope = (typeof EXAM_SCOPES)[number];

/** Explicit override of the derived exam scope for one record. */
export const ExamRelevanceSchema = z.strictObject({
  id: ExamRelevanceIdSchema,
  kind: z.literal('exam_relevance'),
  target: RecordRefSchema,
  examId: ExamIdSchema,
  /** Empty = applies to every version of the exam. Versions must belong to examId (CUR-003). */
  examVersionIds: z.array(ExamVersionIdSchema).max(64),
  scope: z.enum(EXAM_SCOPES),
  importance: z.number().int().min(1).max(5).optional(),
  note: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type ExamRelevance = z.infer<typeof ExamRelevanceSchema>;
