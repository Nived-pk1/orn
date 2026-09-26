/**
 * Identifier scheme and record-kind registry — docs/DOMAIN_MODEL.md §2.
 *
 * IDs are opaque `<prefix>_<body>` strings (body: lowercase ULID at runtime; readable bodies
 * are allowed for seed data and fixtures). IDs are never derived from names, never reused and
 * never change. Nested-object IDs are globally unique as well (INV-01).
 */
import { z } from 'zod';

export const RECORD_KINDS = [
  // Layer 1 — foundation
  'reference',
  'concept',
  // Layer 2 — chemistry
  'species',
  'class',
  'reagent',
  'transformation',
  'named_reaction',
  'mechanism',
  'reaction',
  'caveat',
  'route',
  'relationship',
  // Layer 3 — curriculum
  'exam',
  'exam_version',
  'topic',
  'topic_mapping',
  'exam_relevance',
  // Layer 4 — attachments
  'asset',
  // Layer 5 — presentation
  'navigator_anchor',
  'reaction_scheme',
  'view_preset',
  'entity_display',
] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];
export const RecordKindSchema = z.enum(RECORD_KINDS);

/** Layers: a record may reference only records of the same or a lower layer (INV-05). */
export type Layer = 1 | 2 | 3 | 4 | 5;
export const LAYER_NAMES = {
  1: 'foundation',
  2: 'chemistry',
  3: 'curriculum',
  4: 'attachments',
  5: 'presentation',
} as const satisfies Record<Layer, string>;

export const LAYER_OF_KIND = {
  reference: 1,
  concept: 1,
  species: 2,
  class: 2,
  reagent: 2,
  transformation: 2,
  named_reaction: 2,
  mechanism: 2,
  reaction: 2,
  caveat: 2,
  route: 2,
  relationship: 2,
  exam: 3,
  exam_version: 3,
  topic: 3,
  topic_mapping: 3,
  exam_relevance: 3,
  asset: 4,
  navigator_anchor: 5,
  reaction_scheme: 5,
  view_preset: 5,
  entity_display: 5,
} as const satisfies Record<RecordKind, Layer>;

export const RECORD_ID_PREFIX = {
  reference: 'ref',
  concept: 'cpt',
  species: 'spc',
  class: 'cls',
  reagent: 'rgt',
  transformation: 'trf',
  named_reaction: 'nrx',
  mechanism: 'mec',
  reaction: 'rxn',
  caveat: 'cav',
  route: 'rte',
  relationship: 'rel',
  exam: 'exm',
  exam_version: 'exv',
  topic: 'top',
  topic_mapping: 'tmp',
  exam_relevance: 'erl',
  asset: 'ast',
  navigator_anchor: 'anc',
  reaction_scheme: 'rsc',
  view_preset: 'vpr',
  entity_display: 'edp',
} as const satisfies Record<RecordKind, string>;

export const NESTED_ID_PREFIX = {
  reagentProfile: 'rpf',
  participant: 'prt',
  stage: 'stg',
  conditionVariant: 'cvr',
  outcome: 'out',
  product: 'pdt',
  intermediate: 'int',
  mechanismVariant: 'mvr',
  mechanismStep: 'mst',
  routeStep: 'rst',
  syllabusUnit: 'unt',
} as const;
export type NestedObjectKind = keyof typeof NESTED_ID_PREFIX;

/** Operational identifiers. They never appear as references inside canonical records. */
export const OPERATIONAL_ID_PREFIX = {
  finding: 'fnd',
  editorSession: 'eds',
  importBatch: 'imp',
  snapshot: 'snp',
} as const;

export const ID_BODY_SOURCE = '[0-9a-z][0-9a-z-]{1,62}';
export const ANY_ID_PATTERN = new RegExp(`^[a-z]{3}_${ID_BODY_SOURCE}$`);

export function idPattern(prefix: string): RegExp {
  return new RegExp(`^${prefix}_${ID_BODY_SOURCE}$`);
}

const KIND_BY_PREFIX: ReadonlyMap<string, RecordKind> = new Map(
  RECORD_KINDS.map((kind) => [RECORD_ID_PREFIX[kind], kind] as const),
);

/** Returns the record kind encoded in a record ID, or undefined for nested/operational/malformed IDs. */
export function recordKindOfId(id: string): RecordKind | undefined {
  if (!ANY_ID_PATTERN.test(id)) return undefined;
  return KIND_BY_PREFIX.get(id.slice(0, 3));
}

function idSchema<Brand extends string>(prefix: string) {
  return z
    .string()
    .regex(idPattern(prefix), { message: `Expected an ID of the form ${prefix}_<body>` })
    .brand<Brand>();
}

export const AnyIdSchema = z
  .string()
  .regex(ANY_ID_PATTERN, { message: 'Expected an ID of the form <prefix>_<body>' });

// Record IDs
export const ReferenceIdSchema = idSchema<'ReferenceId'>(RECORD_ID_PREFIX.reference);
export const ConceptIdSchema = idSchema<'ConceptId'>(RECORD_ID_PREFIX.concept);
export const SpeciesIdSchema = idSchema<'SpeciesId'>(RECORD_ID_PREFIX.species);
export const ClassIdSchema = idSchema<'ClassId'>(RECORD_ID_PREFIX.class);
export const ReagentIdSchema = idSchema<'ReagentId'>(RECORD_ID_PREFIX.reagent);
export const TransformationIdSchema = idSchema<'TransformationId'>(RECORD_ID_PREFIX.transformation);
export const NamedReactionIdSchema = idSchema<'NamedReactionId'>(RECORD_ID_PREFIX.named_reaction);
export const MechanismIdSchema = idSchema<'MechanismId'>(RECORD_ID_PREFIX.mechanism);
export const ReactionIdSchema = idSchema<'ReactionId'>(RECORD_ID_PREFIX.reaction);
export const CaveatIdSchema = idSchema<'CaveatId'>(RECORD_ID_PREFIX.caveat);
export const RouteIdSchema = idSchema<'RouteId'>(RECORD_ID_PREFIX.route);
export const RelationshipIdSchema = idSchema<'RelationshipId'>(RECORD_ID_PREFIX.relationship);
export const ExamIdSchema = idSchema<'ExamId'>(RECORD_ID_PREFIX.exam);
export const ExamVersionIdSchema = idSchema<'ExamVersionId'>(RECORD_ID_PREFIX.exam_version);
export const TopicIdSchema = idSchema<'TopicId'>(RECORD_ID_PREFIX.topic);
export const TopicMappingIdSchema = idSchema<'TopicMappingId'>(RECORD_ID_PREFIX.topic_mapping);
export const ExamRelevanceIdSchema = idSchema<'ExamRelevanceId'>(RECORD_ID_PREFIX.exam_relevance);
export const AssetIdSchema = idSchema<'AssetId'>(RECORD_ID_PREFIX.asset);
export const NavigatorAnchorIdSchema = idSchema<'NavigatorAnchorId'>(RECORD_ID_PREFIX.navigator_anchor);
export const ReactionSchemeIdSchema = idSchema<'ReactionSchemeId'>(RECORD_ID_PREFIX.reaction_scheme);
export const ViewPresetIdSchema = idSchema<'ViewPresetId'>(RECORD_ID_PREFIX.view_preset);
export const EntityDisplayIdSchema = idSchema<'EntityDisplayId'>(RECORD_ID_PREFIX.entity_display);

// Nested-object IDs
export const ReagentProfileIdSchema = idSchema<'ReagentProfileId'>(NESTED_ID_PREFIX.reagentProfile);
export const ParticipantIdSchema = idSchema<'ParticipantId'>(NESTED_ID_PREFIX.participant);
export const StageIdSchema = idSchema<'StageId'>(NESTED_ID_PREFIX.stage);
export const ConditionVariantIdSchema = idSchema<'ConditionVariantId'>(NESTED_ID_PREFIX.conditionVariant);
export const OutcomeIdSchema = idSchema<'OutcomeId'>(NESTED_ID_PREFIX.outcome);
export const ProductIdSchema = idSchema<'ProductId'>(NESTED_ID_PREFIX.product);
export const IntermediateIdSchema = idSchema<'IntermediateId'>(NESTED_ID_PREFIX.intermediate);
export const MechanismVariantIdSchema = idSchema<'MechanismVariantId'>(NESTED_ID_PREFIX.mechanismVariant);
export const MechanismStepIdSchema = idSchema<'MechanismStepId'>(NESTED_ID_PREFIX.mechanismStep);
export const RouteStepIdSchema = idSchema<'RouteStepId'>(NESTED_ID_PREFIX.routeStep);
export const SyllabusUnitIdSchema = idSchema<'SyllabusUnitId'>(NESTED_ID_PREFIX.syllabusUnit);

// Operational IDs
export const ImportBatchIdSchema = idSchema<'ImportBatchId'>(OPERATIONAL_ID_PREFIX.importBatch);

export type ReferenceId = z.infer<typeof ReferenceIdSchema>;
export type ConceptId = z.infer<typeof ConceptIdSchema>;
export type SpeciesId = z.infer<typeof SpeciesIdSchema>;
export type ClassId = z.infer<typeof ClassIdSchema>;
export type ReagentId = z.infer<typeof ReagentIdSchema>;
export type TransformationId = z.infer<typeof TransformationIdSchema>;
export type NamedReactionId = z.infer<typeof NamedReactionIdSchema>;
export type MechanismId = z.infer<typeof MechanismIdSchema>;
export type ReactionId = z.infer<typeof ReactionIdSchema>;
export type CaveatId = z.infer<typeof CaveatIdSchema>;
export type RouteId = z.infer<typeof RouteIdSchema>;
export type RelationshipId = z.infer<typeof RelationshipIdSchema>;
export type ExamId = z.infer<typeof ExamIdSchema>;
export type ExamVersionId = z.infer<typeof ExamVersionIdSchema>;
export type TopicId = z.infer<typeof TopicIdSchema>;
export type TopicMappingId = z.infer<typeof TopicMappingIdSchema>;
export type ExamRelevanceId = z.infer<typeof ExamRelevanceIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export type NavigatorAnchorId = z.infer<typeof NavigatorAnchorIdSchema>;
export type ReactionSchemeId = z.infer<typeof ReactionSchemeIdSchema>;
export type ViewPresetId = z.infer<typeof ViewPresetIdSchema>;
export type EntityDisplayId = z.infer<typeof EntityDisplayIdSchema>;
export type ReagentProfileId = z.infer<typeof ReagentProfileIdSchema>;
export type ParticipantId = z.infer<typeof ParticipantIdSchema>;
export type StageId = z.infer<typeof StageIdSchema>;
export type ConditionVariantId = z.infer<typeof ConditionVariantIdSchema>;
export type OutcomeId = z.infer<typeof OutcomeIdSchema>;
export type ProductId = z.infer<typeof ProductIdSchema>;
export type IntermediateId = z.infer<typeof IntermediateIdSchema>;
export type MechanismVariantId = z.infer<typeof MechanismVariantIdSchema>;
export type MechanismStepId = z.infer<typeof MechanismStepIdSchema>;
export type RouteStepId = z.infer<typeof RouteStepIdSchema>;
export type SyllabusUnitId = z.infer<typeof SyllabusUnitIdSchema>;
export type ImportBatchId = z.infer<typeof ImportBatchIdSchema>;
