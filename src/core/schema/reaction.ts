/**
 * Reactions — docs/DOMAIN_MODEL.md §6.
 * A reaction is a first-class record, never an edge. Major/minor is a property of an OUTCOME under
 * given conditions, never of a species. Participants, stages, condition variants and outcomes carry
 * nested IDs so routes, schemes and mechanisms can reference them precisely.
 */
import { z } from 'zod';
import {
  ConceptIdSchema,
  ConditionVariantIdSchema,
  IntermediateIdSchema,
  MechanismIdSchema,
  MechanismVariantIdSchema,
  NamedReactionIdSchema,
  OutcomeIdSchema,
  ParticipantIdSchema,
  ProductIdSchema,
  ReactionIdSchema,
  ReagentProfileIdSchema,
  StageIdSchema,
  TransformationIdSchema,
} from './ids';
import { ConditionParametersSchema } from './conditions';
import {
  ClassificationSchema,
  DifficultySchema,
  LabelTextSchema,
  LIMITS,
  NameTextSchema,
  PositiveNumberSchema,
  recordMetaShape,
  RichTextSchema,
  ShortTextSchema,
  StructureRepSchema,
} from './primitives';
import { SpeciesOrClassRefSchema, SubstanceRefSchema } from './refs';

export const PARTICIPANT_ROLES = [
  'reactant',
  'reagent',
  'catalyst',
  'solvent',
  'initiator',
  'promoter',
  'additive',
  'workup_reagent',
  'spectator',
] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const PHASES = ['s', 'l', 'g', 'aq', 'alc', 'soln', 'melt'] as const;
export const STRENGTHS = ['dilute', 'concentrated', 'fuming', 'glacial', 'saturated'] as const;
export const QUANTITY_QUALIFIERS = ['catalytic', 'excess', 'limiting', 'stoichiometric', 'trace'] as const;

/** Explicit overrides of role defaults (DOMAIN_MODEL.md §6.2). Absent = derived from role. */
export const ParticipantFlagsSchema = z.strictObject({
  contributesAtoms: z.boolean().optional(),
  consumed: z.boolean().optional(),
  catalytic: z.boolean().optional(),
});

export const QuantitySchema = z.strictObject({
  equivalents: PositiveNumberSchema.optional(),
  qualifier: z.enum(QUANTITY_QUALIFIERS).optional(),
  text: LabelTextSchema.optional(),
});

export const ParticipantSchema = z.strictObject({
  id: ParticipantIdSchema,
  ref: SubstanceRefSchema,
  role: z.enum(PARTICIPANT_ROLES),
  coefficient: PositiveNumberSchema.optional(),
  phase: z.enum(PHASES).optional(),
  strength: z.enum(STRENGTHS).optional(),
  dry: z.boolean().optional(),
  quantity: QuantitySchema.optional(),
  /** Only when ref.kind === "reagent"; must be a profile of that reagent (RXN-011). */
  profileId: ReagentProfileIdSchema.optional(),
  flags: ParticipantFlagsSchema.optional(),
  isPrimarySubstrate: z.boolean().optional(),
  /** Wording as entered or imported, e.g. "alc. KOH" — preserved verbatim. */
  originalText: ShortTextSchema.optional(),
  note: RichTextSchema.optional(),
});
export type Participant = z.infer<typeof ParticipantSchema>;

export const STAGE_KINDS = ['reaction', 'workup', 'quench', 'activation', 'purification'] as const;

/** Ordered steps of one reaction (e.g. 1. CH3MgBr, dry ether  2. H3O⁺ workup). Array order is stage order. */
export const StageSchema = z.strictObject({
  id: StageIdSchema,
  kind: z.enum(STAGE_KINDS),
  label: LabelTextSchema.optional(),
  /** Participants introduced in this stage. With stages present, each participant is in exactly one (RXN-007). */
  participantIds: z.array(ParticipantIdSchema).max(LIMITS.participants),
  parameters: ConditionParametersSchema,
  originalText: ShortTextSchema.optional(),
});
export type Stage = z.infer<typeof StageSchema>;

/** Alternative conditions leading to different outcomes (e.g. 413 K vs 443 K for EtOH / conc. H2SO4). */
export const ConditionVariantSchema = z.strictObject({
  id: ConditionVariantIdSchema,
  label: LabelTextSchema,
  /** Stage whose parameters this variant overrides; default = first stage of kind "reaction". */
  stageId: StageIdSchema.optional(),
  /** Fields present here override the stage's fields. */
  parameters: ConditionParametersSchema,
  /** Participants present only under this variant. Participants listed in no variant are common. */
  participantIds: z.array(ParticipantIdSchema).max(LIMITS.participants),
  note: RichTextSchema.optional(),
});
export type ConditionVariant = z.infer<typeof ConditionVariantSchema>;

export const SELECTIVITIES = ['exclusive', 'major', 'minor', 'trace', 'mixture_component', 'unspecified'] as const;
export const PRODUCT_ROLES = ['main', 'coproduct', 'byproduct'] as const;
export const STEREO_OUTCOMES = [
  'retention',
  'inversion',
  'racemisation',
  'syn_addition',
  'anti_addition',
  'cis_selective',
  'trans_selective',
  'enantiomeric_pair',
  'diastereomeric_mixture',
  'no_new_stereocentre',
  'unspecified',
] as const;

export const ProductSchema = z.strictObject({
  id: ProductIdSchema,
  ref: SpeciesOrClassRefSchema,
  role: z.enum(PRODUCT_ROLES),
  coefficient: PositiveNumberSchema.optional(),
  phase: z.enum(PHASES).optional(),
  originalText: ShortTextSchema.optional(),
  note: RichTextSchema.optional(),
});
export type Product = z.infer<typeof ProductSchema>;

export const OutcomeStereoSchema = z.strictObject({
  outcome: z.enum(STEREO_OUTCOMES),
  descriptors: z.array(LabelTextSchema).max(16),
  note: RichTextSchema.optional(),
});

export const MechanismLinkSchema = z.strictObject({
  mechanismId: MechanismIdSchema,
  variantId: MechanismVariantIdSchema.optional(),
});

export const OutcomeSchema = z.strictObject({
  id: OutcomeIdSchema,
  label: LabelTextSchema.optional(),
  /** Empty = the outcome holds under all condition variants. */
  conditionVariantIds: z.array(ConditionVariantIdSchema).max(LIMITS.conditionVariants),
  selectivity: z.enum(SELECTIVITIES),
  products: z.array(ProductSchema).max(LIMITS.products),
  /** Groups competing isomeric outcomes, e.g. "HBr addition regioisomers". */
  isomerGroup: LabelTextSchema.optional(),
  /** e.g. "Markovnikov", "anti-Markovnikov", "para". */
  regiochemistry: LabelTextSchema.optional(),
  stereochemistry: OutcomeStereoSchema.optional(),
  yieldText: LabelTextSchema.optional(),
  mechanism: MechanismLinkSchema.optional(),
  rationale: RichTextSchema.optional(),
  conceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  note: RichTextSchema.optional(),
});
export type Outcome = z.infer<typeof OutcomeSchema>;

export const INTERMEDIATE_KINDS = [
  'carbocation',
  'carbanion',
  'radical',
  'carbene',
  'nitrene',
  'benzyne',
  'enol',
  'enolate',
  'tetrahedral',
  'ylide',
  'complex',
  'isolable_intermediate',
  'other',
] as const;

/** At least one of ref, label or structure is required (RXN-019). */
export const IntermediateSchema = z.strictObject({
  id: IntermediateIdSchema,
  intermediateKind: z.enum(INTERMEDIATE_KINDS),
  ref: SpeciesOrClassRefSchema.optional(),
  label: LabelTextSchema.optional(),
  structure: StructureRepSchema.optional(),
  stageId: StageIdSchema.optional(),
  note: RichTextSchema.optional(),
});

export const REVERSIBILITY = ['equilibrium', 'reversible_under_other_conditions', 'irreversible', 'unknown'] as const;
export const REACTION_PURPOSES = [
  'synthesis',
  'qualitative_test',
  'distinction_test',
  'industrial_process',
  'degradation',
  'protection',
  'mechanistic_probe',
] as const;

export const ReactionSchema = z.strictObject({
  id: ReactionIdSchema,
  kind: z.literal('reaction'),
  name: NameTextSchema,
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  /** generic: written with classes (R–CH2OH → R–CHO); specific: concrete species. */
  scope: z.enum(['generic', 'specific']),
  /** A specific reaction may instantiate a generic one (RXN-013). */
  instanceOfId: ReactionIdSchema.optional(),
  purposes: z.array(z.enum(REACTION_PURPOSES)).max(REACTION_PURPOSES.length),
  namedReactionIds: z.array(NamedReactionIdSchema).max(16),
  transformationIds: z.array(TransformationIdSchema).max(16),
  /** Concepts of conceptKind "reaction_type", e.g. oxidation, electrophilic addition. */
  reactionTypes: z.array(ClassificationSchema).max(16),
  /** Concepts of conceptKind "mechanism_class", e.g. SN2, E1cB. */
  mechanismClasses: z.array(ClassificationSchema).max(16),
  participants: z.array(ParticipantSchema).max(LIMITS.participants),
  stages: z.array(StageSchema).max(LIMITS.stages),
  conditionVariants: z.array(ConditionVariantSchema).max(LIMITS.conditionVariants),
  outcomes: z.array(OutcomeSchema).max(LIMITS.outcomes),
  intermediates: z.array(IntermediateSchema).max(LIMITS.intermediates),
  mechanismIds: z.array(MechanismIdSchema).max(16),
  reversibility: z.strictObject({ kind: z.enum(REVERSIBILITY), note: RichTextSchema.optional() }),
  selectivityNotes: z
    .strictObject({
      regio: RichTextSchema.optional(),
      stereo: RichTextSchema.optional(),
      chemo: RichTextSchema.optional(),
    })
    .optional(),
  /** Display text such as "R–CH2OH → R–CHO". Derived views never parse it. */
  generalizedEquation: ShortTextSchema.optional(),
  /** Atom-mapped reaction (architecturally supported; drives future arrow-pushing checks). */
  mappedReaction: z
    .strictObject({ format: z.enum(['reaction_smiles', 'rxnfile']), value: z.string().min(1).max(LIMITS.molfile) })
    .optional(),
  conceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  prerequisiteConceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  limitations: RichTextSchema.optional(),
  difficulty: DifficultySchema.optional(),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Reaction = z.infer<typeof ReactionSchema>;
