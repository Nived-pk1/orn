/**
 * Dataset container, export document and in-memory canonical state — docs/PERSISTENCE.md §2,
 * docs/MIGRATION.md §1. Exports are deterministic: records sorted by id, keys in schema order.
 */
import { z } from 'zod';
import { AssetIdSchema, RECORD_KINDS, type RecordKind } from './ids';
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
import { Base64Schema, IsoDateTimeSchema, LabelTextSchema, NameTextSchema, RichTextSchema } from './primitives';
import { ReactionSchema } from './reaction';
import type { RecordByKind } from './records';
import { RelationshipSchema } from './relationship';
import { ChemicalClassSchema, ReagentSchema, SpeciesSchema } from './substances';

export const CURRENT_SCHEMA_VERSION = 1;
export const DATASET_FORMAT = 'orn.dataset';
export const PACKAGE_FORMAT = 'orn.package';

export const DatasetMetaSchema = z.strictObject({
  datasetId: z.string().regex(/^[0-9a-z][0-9a-z-]{1,62}$/),
  title: NameTextSchema,
  description: RichTextSchema.optional(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type DatasetMeta = z.infer<typeof DatasetMetaSchema>;

export const EXPORT_SCOPES = ['full', 'chemistry', 'curriculum', 'presentation', 'subset'] as const;

/** Every collection key is always present (possibly empty) so exports are shape-stable. */
export const RecordCollectionsSchema = z.strictObject({
  reference: z.array(ReferenceSchema),
  concept: z.array(ConceptSchema),
  species: z.array(SpeciesSchema),
  class: z.array(ChemicalClassSchema),
  reagent: z.array(ReagentSchema),
  transformation: z.array(TransformationSchema),
  named_reaction: z.array(NamedReactionSchema),
  mechanism: z.array(MechanismSchema),
  reaction: z.array(ReactionSchema),
  caveat: z.array(CaveatSchema),
  route: z.array(RouteSchema),
  relationship: z.array(RelationshipSchema),
  exam: z.array(ExamSchema),
  exam_version: z.array(ExamVersionSchema),
  topic: z.array(TopicSchema),
  topic_mapping: z.array(TopicMappingSchema),
  exam_relevance: z.array(ExamRelevanceSchema),
  asset: z.array(AssetSchema),
  navigator_anchor: z.array(NavigatorAnchorSchema),
  reaction_scheme: z.array(ReactionSchemeSchema),
  view_preset: z.array(ViewPresetSchema),
  entity_display: z.array(EntityDisplaySchema),
});

/** Strict form: what the app writes and what round-trip tests compare. */
export const DatasetDocumentSchema = z.strictObject({
  format: z.literal(DATASET_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  exportedAt: IsoDateTimeSchema,
  exportScope: z.enum(EXPORT_SCOPES),
  generator: z.strictObject({ app: LabelTextSchema, version: LabelTextSchema }),
  meta: DatasetMetaSchema,
  records: RecordCollectionsSchema,
  /** Only in single-file JSON exports that include assets; packages store bytes as files instead. */
  embeddedAssets: z
    .array(z.strictObject({ assetId: AssetIdSchema, base64: Base64Schema }))
    .optional(),
});
export type DatasetDocument = z.infer<typeof DatasetDocumentSchema>;

/**
 * Tolerant envelope used by importers BEFORE migration and per-record validation, so one bad record
 * is quarantined instead of rejecting the whole file (docs/PERSISTENCE.md §7).
 */
export const DatasetEnvelopeSchema = z.object({
  format: z.literal(DATASET_FORMAT),
  schemaVersion: z.number().int().min(1),
  records: z.record(z.string(), z.array(z.unknown())),
});

/** In-memory canonical state: records by kind, then by id. Frozen by Immer; never mutated in place. */
export type RecordTable<K extends RecordKind> = Readonly<Record<string, RecordByKind[K]>>;
export interface CanonicalState {
  readonly meta: DatasetMeta;
  readonly records: { readonly [K in RecordKind]: RecordTable<K> };
}

export function emptyRecordTables(): CanonicalState['records'] {
  const tables = {} as Record<RecordKind, Record<string, never>>;
  for (const kind of RECORD_KINDS) tables[kind] = {};
  return tables as CanonicalState['records'];
}
