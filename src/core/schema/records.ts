/**
 * Record registry: one schema per kind, the discriminated union and kind-indexed types.
 * Collections are 1:1 with kinds. docs/DOMAIN_MODEL.md §1.
 */
import { z } from 'zod';
import type { RecordKind } from './ids';
import { AssetSchema } from './assets';
import { ExamRelevanceSchema, ExamSchema, ExamVersionSchema, TopicMappingSchema, TopicSchema } from './curriculum';
import {
  CaveatSchema,
  ConceptSchema,
  NamedReactionSchema,
  ReferenceSchema,
  RouteSchema,
  TransformationSchema,
} from './knowledge';
import { MechanismSchema } from './mechanism';
import { EntityDisplaySchema, NavigatorAnchorSchema, ReactionSchemeSchema, ViewPresetSchema } from './presentation';
import { ReactionSchema } from './reaction';
import { RelationshipSchema } from './relationship';
import { ChemicalClassSchema, ReagentSchema, SpeciesSchema } from './substances';

export const RECORD_SCHEMAS = {
  reference: ReferenceSchema,
  concept: ConceptSchema,
  species: SpeciesSchema,
  class: ChemicalClassSchema,
  reagent: ReagentSchema,
  transformation: TransformationSchema,
  named_reaction: NamedReactionSchema,
  mechanism: MechanismSchema,
  reaction: ReactionSchema,
  caveat: CaveatSchema,
  route: RouteSchema,
  relationship: RelationshipSchema,
  exam: ExamSchema,
  exam_version: ExamVersionSchema,
  topic: TopicSchema,
  topic_mapping: TopicMappingSchema,
  exam_relevance: ExamRelevanceSchema,
  asset: AssetSchema,
  navigator_anchor: NavigatorAnchorSchema,
  reaction_scheme: ReactionSchemeSchema,
  view_preset: ViewPresetSchema,
  entity_display: EntityDisplaySchema,
} as const satisfies Record<RecordKind, z.ZodType>;

export type RecordByKind = { [K in RecordKind]: z.infer<(typeof RECORD_SCHEMAS)[K]> };
export type AnyRecord = RecordByKind[RecordKind];

export const AnyRecordSchema = z.discriminatedUnion('kind', [
  ReferenceSchema,
  ConceptSchema,
  SpeciesSchema,
  ChemicalClassSchema,
  ReagentSchema,
  TransformationSchema,
  NamedReactionSchema,
  MechanismSchema,
  ReactionSchema,
  CaveatSchema,
  RouteSchema,
  RelationshipSchema,
  ExamSchema,
  ExamVersionSchema,
  TopicSchema,
  TopicMappingSchema,
  ExamRelevanceSchema,
  AssetSchema,
  NavigatorAnchorSchema,
  ReactionSchemeSchema,
  ViewPresetSchema,
  EntityDisplaySchema,
]);
