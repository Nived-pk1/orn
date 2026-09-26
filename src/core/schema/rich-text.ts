/**
 * Where rich text (mini-markup with `[[record links]]`) can appear in each record kind — the
 * companion of the reference registry for soft references (REF-008). Same path syntax as
 * ./references.ts. `rich-text.test.ts` derives the expected list from the maximal fixture and the
 * schemas, so a new rich-text field that is not listed here fails the suite.
 */
import type { RecordKind } from './ids';

export const RICH_TEXT_PATHS: Readonly<Record<RecordKind, readonly string[]>> = {
  reference: ['notes'],
  concept: ['notes', 'studyNotes', 'summary'],
  species: ['acidBaseNotes', 'notes', 'properties[].note', 'stereo.note', 'studyNotes'],
  class: ['description', 'generic.rGroupNote', 'notes', 'studyNotes'],
  reagent: ['description', 'notes', 'profiles[].behaviour', 'studyNotes'],
  transformation: ['description', 'notes', 'studyNotes'],
  named_reaction: ['notes', 'studyNotes', 'summary', 'typicalConditions'],
  mechanism: [
    'notes',
    'studyNotes',
    'summary',
    'variants[].applicability',
    'variants[].note',
    'variants[].steps[].description',
    'variants[].steps[].note',
  ],
  reaction: [
    'conditionVariants[].note',
    'intermediates[].note',
    'limitations',
    'notes',
    'outcomes[].note',
    'outcomes[].products[].note',
    'outcomes[].rationale',
    'outcomes[].stereochemistry.note',
    'participants[].note',
    'reversibility.note',
    'selectivityNotes.chemo',
    'selectivityNotes.regio',
    'selectivityNotes.stereo',
    'studyNotes',
  ],
  caveat: ['explanation', 'notes', 'rule', 'statement', 'trigger'],
  route: ['description', 'notes', 'steps[].note'],
  relationship: ['note'],
  exam: ['notes'],
  exam_version: ['notes', 'units[].officialText'],
  topic: ['notes', 'summary'],
  topic_mapping: ['note'],
  exam_relevance: ['note'],
  asset: ['caption'],
  navigator_anchor: [],
  reaction_scheme: [],
  view_preset: [],
  entity_display: [],
};
