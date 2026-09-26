/**
 * Presentation layer (layer 5) — docs/UI_ARCHITECTURE.md §4, docs/GRAPH_SEMANTICS.md §3.
 * Hubs, arrow placement and display preferences are VIEW decisions. Deleting every presentation
 * record must leave the chemistry valid and unchanged (INV-14). Transient UI state (selection,
 * viewport, open panels) is NOT canonical and lives in the uiState store instead.
 */
import { z } from 'zod';
import {
  AssetIdSchema,
  ConditionVariantIdSchema,
  EntityDisplayIdSchema,
  ExamIdSchema,
  ExamVersionIdSchema,
  NavigatorAnchorIdSchema,
  ParticipantIdSchema,
  ProductIdSchema,
  ReactionIdSchema,
  ReactionSchemeIdSchema,
  TopicIdSchema,
  ViewPresetIdSchema,
} from './ids';
import { EXAM_SCOPES } from './curriculum';
import { FiniteNumberSchema, LabelTextSchema, LIMITS, presentationMetaShape } from './primitives';
import { RecordRefSchema } from './refs';
import { REAGENT_FAMILIES } from './substances';

export const VIEW_KEYS = [
  'navigator',
  'reaction_explorer',
  'precursor_explorer',
  'reagent_explorer',
  'named_reactions',
  'mechanisms',
  'syllabus',
  'search',
] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

/** Marks a class/species/concept as a navigator hub. Being a hub never changes chemical identity. */
export const NavigatorAnchorSchema = z.strictObject({
  id: NavigatorAnchorIdSchema,
  kind: z.literal('navigator_anchor'),
  target: RecordRefSchema,
  label: LabelTextSchema.optional(),
  order: FiniteNumberSchema,
  ...presentationMetaShape,
});
export type NavigatorAnchor = z.infer<typeof NavigatorAnchorSchema>;

export const SCHEME_POSITIONS = ['reactant_side', 'above_arrow', 'below_arrow', 'hidden'] as const;
export const PRODUCT_POSITIONS = ['product_side', 'below_arrow', 'hidden'] as const;

/** How one reaction is drawn: which participants go over/under the arrow. Defaults are derived from roles. */
export const ReactionSchemeSchema = z.strictObject({
  id: ReactionSchemeIdSchema,
  kind: z.literal('reaction_scheme'),
  reactionId: ReactionIdSchema,
  conditionVariantId: ConditionVariantIdSchema.optional(),
  placements: z
    .array(z.strictObject({ participantId: ParticipantIdSchema, position: z.enum(SCHEME_POSITIONS) }))
    .max(LIMITS.participants),
  productPlacements: z
    .array(z.strictObject({ productId: ProductIdSchema, position: z.enum(PRODUCT_POSITIONS) }))
    .max(LIMITS.products),
  showStageNumbers: z.boolean(),
  /** Show an attached image instead of a rendered scheme (the chemistry stays structured). */
  preferAssetId: AssetIdSchema.optional(),
  ...presentationMetaShape,
});
export type ReactionScheme = z.infer<typeof ReactionSchemeSchema>;

export const ViewFiltersSchema = z.strictObject({
  examId: ExamIdSchema.optional(),
  examVersionId: ExamVersionIdSchema.optional(),
  scopes: z.array(z.enum(EXAM_SCOPES)).max(EXAM_SCOPES.length),
  topicIds: z.array(TopicIdSchema).max(LIMITS.idList),
  reagentFamilies: z.array(z.enum(REAGENT_FAMILIES)).max(REAGENT_FAMILIES.length),
  text: LabelTextSchema.optional(),
});
export type ViewFilters = z.infer<typeof ViewFiltersSchema>;

/** A saved, named view configuration (e.g. "JEE Main 2026 — carbonyl chemistry"). */
export const ViewPresetSchema = z.strictObject({
  id: ViewPresetIdSchema,
  kind: z.literal('view_preset'),
  name: LabelTextSchema,
  view: z.enum(VIEW_KEYS),
  filters: ViewFiltersSchema,
  anchorIds: z.array(NavigatorAnchorIdSchema).max(LIMITS.idList),
  ...presentationMetaShape,
});
export type ViewPreset = z.infer<typeof ViewPresetSchema>;

export const LABEL_MODES = ['name', 'formula', 'structure', 'abbreviation'] as const;

/** Per-record display preferences. At most one per target (PRS-001). */
export const EntityDisplaySchema = z.strictObject({
  id: EntityDisplayIdSchema,
  kind: z.literal('entity_display'),
  target: RecordRefSchema,
  /** "never": drawn on arrows as text, not as a node (legacy node:false, e.g. water). */
  showAsNode: z.enum(['default', 'never']),
  labelMode: z.enum(LABEL_MODES).optional(),
  abbreviation: LabelTextSchema.optional(),
  ...presentationMetaShape,
});
export type EntityDisplay = z.infer<typeof EntityDisplaySchema>;
