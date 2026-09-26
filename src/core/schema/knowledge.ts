/**
 * Knowledge records: transformations, named reactions, concepts, caveats, routes and evidence
 * references — docs/DOMAIN_MODEL.md §8.
 */
import { z } from 'zod';
import {
  CaveatIdSchema,
  ClassIdSchema,
  ConceptIdSchema,
  ConditionVariantIdSchema,
  NamedReactionIdSchema,
  OutcomeIdSchema,
  ReactionIdSchema,
  ReferenceIdSchema,
  RouteIdSchema,
  RouteStepIdSchema,
  TransformationIdSchema,
} from './ids';
import { ConditionParametersSchema } from './conditions';
import {
  DifficultySchema,
  LabelTextSchema,
  LIMITS,
  NameTextSchema,
  recordMetaShape,
  RichTextSchema,
  SafeUrlSchema,
  ShortTextSchema,
} from './primitives';
import { RecordRefSchema, SpeciesOrClassRefSchema } from './refs';

export const CARBON_CHAIN_CHANGES = [
  'ascent',
  'descent',
  'none',
  'cyclisation',
  'ring_opening',
  'rearrangement',
  'unspecified',
] as const;

/** A functional-group interconversion between classes, e.g. "1° alcohol → aldehyde". */
export const TransformationSchema = z.strictObject({
  id: TransformationIdSchema,
  kind: z.literal('transformation'),
  name: NameTextSchema,
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  fromClassIds: z.array(ClassIdSchema).max(16),
  toClassIds: z.array(ClassIdSchema).max(16),
  equationText: ShortTextSchema.optional(),
  /** Architecturally supported: reaction SMARTS for future automatic matching. */
  reactionSmarts: z.string().max(LIMITS.inlineStructure).optional(),
  bondChangeSummary: ShortTextSchema.optional(),
  carbonChainChange: z.enum(CARBON_CHAIN_CHANGES).optional(),
  conceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  description: RichTextSchema.optional(),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Transformation = z.infer<typeof TransformationSchema>;

/** Identity and teaching notes only; its reactions, transformations and mechanisms are derived. */
export const NamedReactionSchema = z.strictObject({
  id: NamedReactionIdSchema,
  kind: z.literal('named_reaction'),
  name: NameTextSchema,
  /** Alternate spellings: "Reimer–Tiemann", "Reimer Tiemann". */
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  /** Family hierarchy, e.g. Friedel–Crafts → Friedel–Crafts acylation. DAG (HIER-001). */
  parentIds: z.array(NamedReactionIdSchema).max(16),
  summary: RichTextSchema.optional(),
  typicalConditions: RichTextSchema.optional(),
  conceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  prerequisiteConceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  difficulty: DifficultySchema.optional(),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type NamedReaction = z.infer<typeof NamedReactionSchema>;

export const CONCEPT_KINDS = [
  'reaction_type',
  'mechanism_class',
  'reaction_family',
  'electronic_effect',
  'reactive_intermediate',
  'stability',
  'acidity_basicity',
  'stereochemistry',
  'isomerism',
  'aromaticity',
  'nomenclature',
  'bonding',
  'qualitative_test',
  'rule',
  'general',
] as const;

export const ConceptSchema = z.strictObject({
  id: ConceptIdSchema,
  kind: z.literal('concept'),
  name: NameTextSchema,
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  conceptKind: z.enum(CONCEPT_KINDS),
  /** DAG (HIER-001): SN2 ⊂ nucleophilic substitution. */
  parentIds: z.array(ConceptIdSchema).max(16),
  summary: RichTextSchema.optional(),
  difficulty: DifficultySchema.optional(),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Concept = z.infer<typeof ConceptSchema>;

export const CAVEAT_KINDS = ['exception', 'trap', 'limitation', 'common_mistake', 'special_case'] as const;
export const CAVEAT_TARGET_ROLES = [
  'affected_reaction',
  'affected_substrate',
  'affected_product',
  'affected_reagent',
  'affected_mechanism',
  'context',
] as const;

/** Exceptions, traps and limitations are records of their own that point at what they qualify. */
export const CaveatSchema = z.strictObject({
  id: CaveatIdSchema,
  kind: z.literal('caveat'),
  caveatKind: z.enum(CAVEAT_KINDS),
  title: LabelTextSchema,
  /** The general rule being qualified, e.g. "HX adds by Markovnikov's rule". */
  rule: RichTextSchema.optional(),
  /** The exception itself, e.g. "HBr with peroxide adds anti-Markovnikov". */
  statement: RichTextSchema,
  trigger: RichTextSchema.optional(),
  triggerConditions: ConditionParametersSchema.optional(),
  explanation: RichTextSchema.optional(),
  targets: z
    .array(z.strictObject({ ref: RecordRefSchema, as: z.enum(CAVEAT_TARGET_ROLES) }))
    .max(LIMITS.idList),
  conceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  importance: z.enum(['low', 'medium', 'high']).optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Caveat = z.infer<typeof CaveatSchema>;

export const ROUTE_PURPOSES = ['curated', 'worked_example', 'exam_problem', 'user'] as const;

/** A step references one reaction (optionally one outcome/variant) and the steps that feed it. */
export const RouteStepSchema = z.strictObject({
  id: RouteStepIdSchema,
  reactionId: ReactionIdSchema,
  outcomeId: OutcomeIdSchema.optional(),
  conditionVariantId: ConditionVariantIdSchema.optional(),
  /** Step DAG (RTE-001). Empty = starts from available materials. */
  inputFromStepIds: z.array(RouteStepIdSchema).max(LIMITS.routeSteps),
  note: RichTextSchema.optional(),
});

/** A stored multi-step synthesis. Search results are derived and never stored unless the user saves one. */
export const RouteSchema = z.strictObject({
  id: RouteIdSchema,
  kind: z.literal('route'),
  name: NameTextSchema,
  target: SpeciesOrClassRefSchema.optional(),
  purpose: z.enum(ROUTE_PURPOSES),
  steps: z.array(RouteStepSchema).max(LIMITS.routeSteps),
  description: RichTextSchema.optional(),
  conceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Route = z.infer<typeof RouteSchema>;

export const REFERENCE_KINDS = [
  'textbook',
  'ncert',
  'article',
  'website',
  'exam_paper',
  'syllabus_document',
  'notes',
  'other',
] as const;

/** Evidence source (layer 1). Cited from any record via `citations`. */
export const ReferenceSchema = z.strictObject({
  id: ReferenceIdSchema,
  kind: z.literal('reference'),
  refKind: z.enum(REFERENCE_KINDS),
  title: NameTextSchema,
  authors: z.array(LabelTextSchema).max(32),
  year: z.number().int().min(1500).max(2200).optional(),
  edition: LabelTextSchema.optional(),
  publisher: LabelTextSchema.optional(),
  url: SafeUrlSchema.optional(),
  /** ISBN, DOI or an exam paper code. */
  identifier: LabelTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Reference = z.infer<typeof ReferenceSchema>;

