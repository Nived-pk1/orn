/** Schema types and vocabularies used by the demo builders, gathered in one import. */
import type { z } from 'zod';
import type {
  ConditionParametersSchema,
  MechanismStepSchema,
  MechanismVariantSchema,
  ParticipantSchema,
  PropertyEntrySchema,
  StereoInfoSchema,
} from '@/core/schema';

export type {
  Caveat,
  ChemicalClass,
  ClassId,
  Concept,
  ConceptId,
  DatasetDocument,
  Exam,
  ExamRelevance,
  ExamVersion,
  Mechanism,
  NamedReaction,
  Names,
  Reagent,
  ReagentId,
  Reaction,
  ReactionScheme,
  Reference,
  Relationship,
  Review,
  Route,
  Species,
  SpeciesId,
  SpeciesOrClassRef,
  StructureRep,
  SubstanceRef,
  Temperature,
  Topic,
  TopicMapping,
  Transformation,
  RecordRef,
} from '@/core/schema';
export { CLASS_KINDS, SPECIES_KINDS } from '@/core/schema';

export type ConditionParameters = z.infer<typeof ConditionParametersSchema>;
export type MechanismStep = z.infer<typeof MechanismStepSchema>;
export type MechanismVariant = z.infer<typeof MechanismVariantSchema>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type PropertyEntry = z.infer<typeof PropertyEntrySchema>;
export type StereoInfo = z.infer<typeof StereoInfoSchema>;
