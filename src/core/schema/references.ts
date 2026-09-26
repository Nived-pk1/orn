/**
 * Reference registry — the single declaration of every reference in the canonical model.
 * docs/DOMAIN_MODEL.md §4 and docs/VALIDATION_RULES.md (REF-*).
 *
 * Consumers (all generic, none hand-written per field):
 *   - L2 validation (dangling, wrong kind, layering, nested resolution)
 *   - reverse-reference index and delete-impact dry runs (restrict / cascade / detach)
 *   - import ID remapping and subset-export dependency closure
 *   - duplicate-record nested-ID regeneration (NESTED_ID_SPECS)
 * A coverage test (Phase 1) asserts every ID-shaped value in maximal fixtures is covered here.
 *
 * Path syntax: dot-separated fields; `[]` iterates an array. A terminal `[]` means "array of IDs".
 */
import { LAYER_OF_KIND, RECORD_KINDS, type RecordKind } from './ids';
import { CAVEAT_TARGET_KINDS } from './reference-kinds';

export type OnDelete =
  /** Deleting the target is blocked while this reference exists (user must re-point or delete first). */
  | 'restrict'
  /** Deleting the target deletes the owning record (only for records meaningless without it). */
  | 'cascade'
  /** Deleting the target removes the reference (array element, optional field, or `container`). */
  | 'detach';

export type RefTarget =
  /** Plain ID string; the branded schema fixes the kind. */
  | { readonly type: 'id'; readonly kind: RecordKind }
  /** `{ kind, id }` object; `kinds` lists what the field may point to. */
  | { readonly type: 'ref'; readonly kinds: readonly RecordKind[] }
  /** Nested ID defined elsewhere in the SAME record (e.g. a stage listing participant IDs). */
  | { readonly type: 'local'; readonly collection: string }
  /** Nested ID inside ANOTHER record, located through a sibling or root field holding that record's ID. */
  | {
      readonly type: 'nested';
      readonly via: { readonly scope: 'sibling' | 'root'; readonly field: string };
      readonly kind: RecordKind;
      readonly collection: string;
    };

export interface ReferenceSpec {
  readonly owner: RecordKind;
  readonly path: string;
  readonly target: RefTarget;
  readonly onDelete: OnDelete;
  /** Path of the element/field removed on detach; defaults to the referencing value itself. */
  readonly container?: string;
}

export interface NestedIdSpec {
  readonly owner: RecordKind;
  readonly path: string;
  readonly prefix: string;
}

const kindsUpToLayer = (layer: number): readonly RecordKind[] =>
  RECORD_KINDS.filter((kind) => LAYER_OF_KIND[kind] <= layer);

const SUBSTANCE: readonly RecordKind[] = ['species', 'class', 'reagent'];
const SPECIES_OR_CLASS: readonly RecordKind[] = ['species', 'class'];

const id = (kind: RecordKind): RefTarget => ({ type: 'id', kind });
const ref = (kinds: readonly RecordKind[]): RefTarget => ({ type: 'ref', kinds });
const local = (collection: string): RefTarget => ({ type: 'local', collection });
const nested = (scope: 'sibling' | 'root', field: string, kind: RecordKind, collection: string): RefTarget => ({
  type: 'nested',
  via: { scope, field },
  kind,
  collection,
});

/** Kinds whose records carry `citations` (all non-presentation kinds). */
const CITING_KINDS = RECORD_KINDS.filter((kind) => LAYER_OF_KIND[kind] <= 4);

const CITATION_SPECS: readonly ReferenceSpec[] = CITING_KINDS.map((owner) => ({
  owner,
  path: 'citations[].referenceId',
  target: id('reference'),
  onDelete: 'detach',
  container: 'citations[]',
}));

const SPECS: readonly ReferenceSpec[] = [
  // Layer 1
  { owner: 'concept', path: 'parentIds[]', target: id('concept'), onDelete: 'detach' },

  // Species / classes / reagents
  { owner: 'species', path: 'classIds[]', target: id('class'), onDelete: 'detach' },
  {
    owner: 'species',
    path: 'properties[].citations[].referenceId',
    target: id('reference'),
    onDelete: 'detach',
    container: 'properties[].citations[]',
  },
  { owner: 'class', path: 'parentIds[]', target: id('class'), onDelete: 'detach' },
  { owner: 'class', path: 'exampleSpeciesIds[]', target: id('species'), onDelete: 'detach' },
  { owner: 'reagent', path: 'speciesId', target: id('species'), onDelete: 'detach' },
  { owner: 'reagent', path: 'components[].ref', target: ref(SUBSTANCE), onDelete: 'restrict' },
  { owner: 'reagent', path: 'classIds[]', target: id('class'), onDelete: 'detach' },

  // Transformations, named reactions, mechanisms
  { owner: 'transformation', path: 'fromClassIds[]', target: id('class'), onDelete: 'restrict' },
  { owner: 'transformation', path: 'toClassIds[]', target: id('class'), onDelete: 'restrict' },
  { owner: 'transformation', path: 'conceptIds[]', target: id('concept'), onDelete: 'detach' },
  { owner: 'named_reaction', path: 'parentIds[]', target: id('named_reaction'), onDelete: 'detach' },
  { owner: 'named_reaction', path: 'conceptIds[]', target: id('concept'), onDelete: 'detach' },
  { owner: 'named_reaction', path: 'prerequisiteConceptIds[]', target: id('concept'), onDelete: 'detach' },
  {
    owner: 'mechanism',
    path: 'mechanismClasses[].conceptId',
    target: id('concept'),
    onDelete: 'detach',
    container: 'mechanismClasses[]',
  },
  { owner: 'mechanism', path: 'variants[].steps[].species[].ref', target: ref(SUBSTANCE), onDelete: 'detach' },
  { owner: 'mechanism', path: 'conceptIds[]', target: id('concept'), onDelete: 'detach' },

  // Reactions
  { owner: 'reaction', path: 'instanceOfId', target: id('reaction'), onDelete: 'detach' },
  { owner: 'reaction', path: 'namedReactionIds[]', target: id('named_reaction'), onDelete: 'detach' },
  { owner: 'reaction', path: 'transformationIds[]', target: id('transformation'), onDelete: 'detach' },
  {
    owner: 'reaction',
    path: 'reactionTypes[].conceptId',
    target: id('concept'),
    onDelete: 'detach',
    container: 'reactionTypes[]',
  },
  {
    owner: 'reaction',
    path: 'mechanismClasses[].conceptId',
    target: id('concept'),
    onDelete: 'detach',
    container: 'mechanismClasses[]',
  },
  { owner: 'reaction', path: 'participants[].ref', target: ref(SUBSTANCE), onDelete: 'restrict' },
  {
    owner: 'reaction',
    path: 'participants[].profileId',
    target: nested('sibling', 'ref', 'reagent', 'profiles'),
    onDelete: 'detach',
  },
  { owner: 'reaction', path: 'stages[].participantIds[]', target: local('participants'), onDelete: 'detach' },
  { owner: 'reaction', path: 'conditionVariants[].stageId', target: local('stages'), onDelete: 'detach' },
  {
    owner: 'reaction',
    path: 'conditionVariants[].participantIds[]',
    target: local('participants'),
    onDelete: 'detach',
  },
  {
    owner: 'reaction',
    path: 'outcomes[].conditionVariantIds[]',
    target: local('conditionVariants'),
    onDelete: 'restrict',
  },
  { owner: 'reaction', path: 'outcomes[].products[].ref', target: ref(SPECIES_OR_CLASS), onDelete: 'restrict' },
  {
    owner: 'reaction',
    path: 'outcomes[].mechanism.mechanismId',
    target: id('mechanism'),
    onDelete: 'detach',
    container: 'outcomes[].mechanism',
  },
  {
    owner: 'reaction',
    path: 'outcomes[].mechanism.variantId',
    target: nested('sibling', 'mechanismId', 'mechanism', 'variants'),
    onDelete: 'detach',
  },
  { owner: 'reaction', path: 'outcomes[].conceptIds[]', target: id('concept'), onDelete: 'detach' },
  { owner: 'reaction', path: 'intermediates[].ref', target: ref(SPECIES_OR_CLASS), onDelete: 'restrict' },
  { owner: 'reaction', path: 'intermediates[].stageId', target: local('stages'), onDelete: 'detach' },
  { owner: 'reaction', path: 'mechanismIds[]', target: id('mechanism'), onDelete: 'detach' },
  { owner: 'reaction', path: 'conceptIds[]', target: id('concept'), onDelete: 'detach' },
  { owner: 'reaction', path: 'prerequisiteConceptIds[]', target: id('concept'), onDelete: 'detach' },

  // Caveats, routes, relationships
  {
    owner: 'caveat',
    path: 'targets[].ref',
    target: ref(CAVEAT_TARGET_KINDS),
    onDelete: 'detach',
    container: 'targets[]',
  },
  { owner: 'caveat', path: 'conceptIds[]', target: id('concept'), onDelete: 'detach' },
  { owner: 'route', path: 'target', target: ref(SPECIES_OR_CLASS), onDelete: 'detach' },
  { owner: 'route', path: 'steps[].reactionId', target: id('reaction'), onDelete: 'restrict' },
  {
    owner: 'route',
    path: 'steps[].outcomeId',
    target: nested('sibling', 'reactionId', 'reaction', 'outcomes'),
    onDelete: 'restrict',
  },
  {
    owner: 'route',
    path: 'steps[].conditionVariantId',
    target: nested('sibling', 'reactionId', 'reaction', 'conditionVariants'),
    onDelete: 'restrict',
  },
  { owner: 'route', path: 'steps[].inputFromStepIds[]', target: local('steps'), onDelete: 'detach' },
  { owner: 'route', path: 'conceptIds[]', target: id('concept'), onDelete: 'detach' },
  { owner: 'relationship', path: 'from', target: ref(kindsUpToLayer(2)), onDelete: 'cascade' },
  { owner: 'relationship', path: 'to', target: ref(kindsUpToLayer(2)), onDelete: 'cascade' },

  // Curriculum
  { owner: 'exam_version', path: 'examId', target: id('exam'), onDelete: 'restrict' },
  {
    owner: 'exam_version',
    path: 'units[].topicCoverage[].topicId',
    target: id('topic'),
    onDelete: 'detach',
    container: 'units[].topicCoverage[]',
  },
  { owner: 'topic', path: 'parentId', target: id('topic'), onDelete: 'restrict' },
  { owner: 'topic_mapping', path: 'topicId', target: id('topic'), onDelete: 'cascade' },
  { owner: 'topic_mapping', path: 'target', target: ref(kindsUpToLayer(2)), onDelete: 'cascade' },
  { owner: 'exam_relevance', path: 'target', target: ref(kindsUpToLayer(2)), onDelete: 'cascade' },
  { owner: 'exam_relevance', path: 'examId', target: id('exam'), onDelete: 'cascade' },
  { owner: 'exam_relevance', path: 'examVersionIds[]', target: id('exam_version'), onDelete: 'restrict' },

  // Attachments
  {
    owner: 'asset',
    path: 'attachedTo[].ref',
    target: ref(kindsUpToLayer(3)),
    onDelete: 'detach',
    container: 'attachedTo[]',
  },

  // Presentation
  {
    owner: 'navigator_anchor',
    path: 'target',
    target: ref(['class', 'species', 'reagent', 'concept', 'named_reaction']),
    onDelete: 'cascade',
  },
  { owner: 'reaction_scheme', path: 'reactionId', target: id('reaction'), onDelete: 'cascade' },
  {
    owner: 'reaction_scheme',
    path: 'conditionVariantId',
    target: nested('root', 'reactionId', 'reaction', 'conditionVariants'),
    onDelete: 'detach',
  },
  {
    owner: 'reaction_scheme',
    path: 'placements[].participantId',
    target: nested('root', 'reactionId', 'reaction', 'participants'),
    onDelete: 'detach',
    container: 'placements[]',
  },
  {
    owner: 'reaction_scheme',
    path: 'productPlacements[].productId',
    target: nested('root', 'reactionId', 'reaction', 'outcomes[].products'),
    onDelete: 'detach',
    container: 'productPlacements[]',
  },
  { owner: 'reaction_scheme', path: 'preferAssetId', target: id('asset'), onDelete: 'detach' },
  { owner: 'view_preset', path: 'anchorIds[]', target: id('navigator_anchor'), onDelete: 'detach' },
  { owner: 'view_preset', path: 'filters.examId', target: id('exam'), onDelete: 'detach' },
  { owner: 'view_preset', path: 'filters.examVersionId', target: id('exam_version'), onDelete: 'detach' },
  { owner: 'view_preset', path: 'filters.topicIds[]', target: id('topic'), onDelete: 'detach' },
  { owner: 'entity_display', path: 'target', target: ref(SUBSTANCE), onDelete: 'cascade' },
];

export const REFERENCE_SPECS: readonly ReferenceSpec[] = [...CITATION_SPECS, ...SPECS];

/** Where nested IDs are DEFINED (for global uniqueness, INV-01, and ID regeneration on duplicate). */
export const NESTED_ID_SPECS: readonly NestedIdSpec[] = [
  { owner: 'reagent', path: 'profiles[].id', prefix: 'rpf' },
  { owner: 'reaction', path: 'participants[].id', prefix: 'prt' },
  { owner: 'reaction', path: 'stages[].id', prefix: 'stg' },
  { owner: 'reaction', path: 'conditionVariants[].id', prefix: 'cvr' },
  { owner: 'reaction', path: 'outcomes[].id', prefix: 'out' },
  { owner: 'reaction', path: 'outcomes[].products[].id', prefix: 'pdt' },
  { owner: 'reaction', path: 'intermediates[].id', prefix: 'int' },
  { owner: 'mechanism', path: 'variants[].id', prefix: 'mvr' },
  { owner: 'mechanism', path: 'variants[].steps[].id', prefix: 'mst' },
  { owner: 'route', path: 'steps[].id', prefix: 'rst' },
  { owner: 'exam_version', path: 'units[].id', prefix: 'unt' },
];
