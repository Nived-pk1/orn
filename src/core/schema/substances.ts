/**
 * Species, chemical classes and reagents — docs/DOMAIN_MODEL.md §5.
 * A species is a specific substance; a class is a generic family (alcohols, R–MgX); a reagent is
 * what a chemist adds (possibly a mixture with named profiles, e.g. Baeyer's reagent).
 */
import { z } from 'zod';
import { ClassIdSchema, ReagentIdSchema, ReagentProfileIdSchema, SpeciesIdSchema } from './ids';
import { ConditionParametersSchema } from './conditions';
import {
  CitationSchema,
  LabelTextSchema,
  LIMITS,
  NamesSchema,
  NameTextSchema,
  recordMetaShape,
  RichTextSchema,
  ShortTextSchema,
  StructureRepSchema,
} from './primitives';
import { SubstanceRefSchema } from './refs';

export const SPECIES_KINDS = [
  'molecule',
  'ion',
  'salt',
  'radical',
  'reactive_intermediate',
  'element',
  'polymer',
  'unspecified',
] as const;
export const AROMATICITY = ['aromatic', 'antiaromatic', 'non_aromatic', 'unspecified'] as const;
export const STEREO_KINDS = [
  'achiral',
  'single_stereoisomer',
  'racemic',
  'meso',
  'diastereomeric_mixture',
  'unspecified',
] as const;

export const StereoInfoSchema = z.strictObject({
  kind: z.enum(STEREO_KINDS),
  /** e.g. "2R", "E", "cis". Must agree with the structure when one exists (CHEM-006). */
  descriptors: z.array(LabelTextSchema).max(32),
  note: RichTextSchema.optional(),
});

export const PROPERTY_KEYS = [
  'physical_state',
  'boiling_point',
  'melting_point',
  'solubility',
  'density',
  'acidity',
  'basicity',
  'odour',
  'colour',
  'dipole_moment',
  'other',
] as const;

export const PropertyEntrySchema = z.strictObject({
  key: z.enum(PROPERTY_KEYS),
  /** Required when key is "other" (SPC-007). */
  label: LabelTextSchema.optional(),
  value: ShortTextSchema,
  note: RichTextSchema.optional(),
  citations: z.array(CitationSchema).max(LIMITS.citations),
});

export const SpeciesSchema = z.strictObject({
  id: SpeciesIdSchema,
  kind: z.literal('species'),
  names: NamesSchema,
  speciesKind: z.enum(SPECIES_KINDS),
  /** Optional: many species are taught before a structure is entered (DOMAIN_MODEL.md §5.1). */
  structure: StructureRepSchema.optional(),
  /** User-entered formula. The derived formula is computed; a mismatch is a WARNING (CHEM-003). */
  formula: LabelTextSchema.optional(),
  charge: z.number().int().min(-20).max(20).optional(),
  isotopeNote: ShortTextSchema.optional(),
  classIds: z.array(ClassIdSchema).max(LIMITS.idList),
  stereo: StereoInfoSchema.optional(),
  /** User claim; the derived value is displayed beside it. */
  aromaticity: z.enum(AROMATICITY).optional(),
  properties: z.array(PropertyEntrySchema).max(LIMITS.properties),
  acidBaseNotes: RichTextSchema.optional(),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Species = z.infer<typeof SpeciesSchema>;

export const CLASS_KINDS = [
  'compound_class',
  'functional_group',
  'structural_family',
  'homologous_series',
  'reagent_family',
] as const;

export const ClassGenericSchema = z.strictObject({
  /** Display text, e.g. "R–OH". */
  formulaText: LabelTextSchema.optional(),
  /** General molecular formula of a series, e.g. "CnH2n+2". */
  generalFormula: LabelTextSchema.optional(),
  /** Generic structure with R-group labels (CXSMILES or molfile). Never a representative species. */
  structure: StructureRepSchema.optional(),
  /** Membership query used only for derived suggestions (CHEM-007), never to assign classes silently. */
  smarts: z.string().max(LIMITS.inlineStructure).optional(),
  rGroupNote: RichTextSchema.optional(),
});

export const ChemicalClassSchema = z.strictObject({
  id: ClassIdSchema,
  kind: z.literal('class'),
  names: NamesSchema,
  classKind: z.enum(CLASS_KINDS),
  /** DAG (HIER-001). Primary alcohols ⊂ alcohols. */
  parentIds: z.array(ClassIdSchema).max(32),
  generic: ClassGenericSchema.optional(),
  /** Curated, ordered examples; each should list this class (CLS-001). */
  exampleSpeciesIds: z.array(SpeciesIdSchema).max(32),
  description: RichTextSchema.optional(),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type ChemicalClass = z.infer<typeof ChemicalClassSchema>;

export const REAGENT_FAMILIES = [
  'oxidant',
  'reductant',
  'acid',
  'base',
  'lewis_acid',
  'nucleophile',
  'electrophile',
  'radical_initiator',
  'catalyst',
  'dehydrating_agent',
  'halogenating_agent',
  'organometallic',
  'diazotising_agent',
  'coupling_agent',
  'drying_agent',
  'solvent',
  'test_reagent',
] as const;
export type ReagentFamily = (typeof REAGENT_FAMILIES)[number];

export const COMPONENT_ROLES = ['active', 'support', 'poison', 'solvent', 'additive', 'co_catalyst'] as const;

export const ReagentComponentSchema = z.strictObject({
  ref: SubstanceRefSchema,
  role: z.enum(COMPONENT_ROLES),
  amountText: LabelTextSchema.optional(),
});

/** A named way of using a reagent, e.g. KMnO4 "cold, dilute, alkaline" = Baeyer's reagent. */
export const ReagentProfileSchema = z.strictObject({
  id: ReagentProfileIdSchema,
  label: LabelTextSchema,
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  parameters: ConditionParametersSchema,
  behaviour: RichTextSchema.optional(),
});

export const ReagentSchema = z.strictObject({
  id: ReagentIdSchema,
  kind: z.literal('reagent'),
  names: NamesSchema,
  /** Set when the reagent is exactly one defined species (e.g. PCC). */
  speciesId: SpeciesIdSchema.optional(),
  /** Mixtures, supported or poisoned catalysts (Lindlar: Pd on CaCO3 + quinoline). Acyclic (HIER-003). */
  components: z.array(ReagentComponentSchema).max(16),
  /** Display formula, e.g. "KMnO4 / H⁺". */
  formulaText: LabelTextSchema.optional(),
  families: z.array(z.enum(REAGENT_FAMILIES)).max(REAGENT_FAMILIES.length),
  /** Chemical families (classes with classKind "reagent_family", e.g. hydride reducing agents). */
  classIds: z.array(ClassIdSchema).max(LIMITS.idList),
  profiles: z.array(ReagentProfileSchema).max(16),
  description: RichTextSchema.optional(),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Reagent = z.infer<typeof ReagentSchema>;
