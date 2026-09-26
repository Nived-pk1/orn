/**
 * Mechanisms — docs/DOMAIN_MODEL.md §7.
 * Mechanism → variants (e.g. acid- vs base-catalysed) → ordered steps. Steps carry inline structures
 * with atom-map numbers so bonds and curved arrows can be expressed precisely (arrow-pushing ready).
 */
import { z } from 'zod';
import { ConceptIdSchema, MechanismIdSchema, MechanismStepIdSchema, MechanismVariantIdSchema } from './ids';
import {
  ClassificationSchema,
  LabelTextSchema,
  LIMITS,
  NameTextSchema,
  recordMetaShape,
  RichTextSchema,
  StructureRepSchema,
} from './primitives';
import { SubstanceRefSchema } from './refs';

export const STEP_KINDS = [
  'bond_formation',
  'bond_cleavage',
  'proton_transfer',
  'nucleophilic_attack',
  'electrophilic_attack',
  'leaving_group_departure',
  'rearrangement',
  'hydride_shift',
  'alkyl_shift',
  'radical_initiation',
  'radical_propagation',
  'radical_termination',
  'tautomerisation',
  'addition',
  'elimination',
  'electron_transfer',
  'coordination',
  'other',
] as const;

export const STEP_SPECIES_ROLES = [
  'reactant',
  'reagent',
  'intermediate',
  'transition_state',
  'product',
  'leaving_group',
  'catalyst',
] as const;

/** Atom-map number inside the step's structures (unique across all species of one step). */
export const AtomMapSchema = z.number().int().min(1).max(999);

export const BondChangeSchema = z.strictObject({
  atoms: z.tuple([AtomMapSchema, AtomMapSchema]),
  order: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  aromatic: z.boolean().optional(),
  note: LabelTextSchema.optional(),
});

export const ElectronSiteSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('atom'), atom: AtomMapSchema }),
  z.strictObject({ kind: z.literal('lone_pair'), atom: AtomMapSchema }),
  z.strictObject({ kind: z.literal('radical'), atom: AtomMapSchema }),
  z.strictObject({ kind: z.literal('bond'), atoms: z.tuple([AtomMapSchema, AtomMapSchema]) }),
]);

/** One curved arrow: electrons move from a source site to a sink site. */
export const ElectronMovementSchema = z.strictObject({
  from: ElectronSiteSchema,
  to: ElectronSiteSchema,
  electrons: z.union([z.literal(1), z.literal(2)]),
});

/** At least one of ref, label or structure (MEC-002). Atom maps must resolve in `structure` (CHEM-008). */
export const StepSpeciesSchema = z.strictObject({
  role: z.enum(STEP_SPECIES_ROLES),
  ref: SubstanceRefSchema.optional(),
  label: LabelTextSchema.optional(),
  structure: StructureRepSchema.optional(),
});

export const MechanismStepSchema = z.strictObject({
  id: MechanismStepIdSchema,
  title: LabelTextSchema.optional(),
  stepKinds: z.array(z.enum(STEP_KINDS)).max(STEP_KINDS.length),
  description: RichTextSchema.optional(),
  species: z.array(StepSpeciesSchema).max(LIMITS.stepSpecies),
  bondsFormed: z.array(BondChangeSchema).max(LIMITS.electronMovements),
  bondsBroken: z.array(BondChangeSchema).max(LIMITS.electronMovements),
  electronMovements: z.array(ElectronMovementSchema).max(LIMITS.electronMovements),
  isRateDetermining: z.boolean().optional(),
  reversible: z.boolean().optional(),
  stereochemicalEvent: LabelTextSchema.optional(),
  note: RichTextSchema.optional(),
});

export const MechanismVariantSchema = z.strictObject({
  id: MechanismVariantIdSchema,
  label: LabelTextSchema,
  /** When this pathway operates, e.g. "3° substrates in polar protic solvent". */
  applicability: RichTextSchema.optional(),
  steps: z.array(MechanismStepSchema).max(LIMITS.mechanismSteps),
  rateLaw: LabelTextSchema.optional(),
  note: RichTextSchema.optional(),
});

/** Reusable across reactions: reactions point to mechanisms, never the reverse. */
export const MechanismSchema = z.strictObject({
  id: MechanismIdSchema,
  kind: z.literal('mechanism'),
  name: NameTextSchema,
  aliases: z.array(NameTextSchema).max(LIMITS.aliases),
  mechanismClasses: z.array(ClassificationSchema).max(16),
  summary: RichTextSchema.optional(),
  variants: z.array(MechanismVariantSchema).max(LIMITS.mechanismVariants),
  conceptIds: z.array(ConceptIdSchema).max(LIMITS.idList),
  studyNotes: RichTextSchema.optional(),
  notes: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Mechanism = z.infer<typeof MechanismSchema>;
