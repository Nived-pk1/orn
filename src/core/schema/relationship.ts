/**
 * Curated relationships between records — docs/GRAPH_SEMANTICS.md §6.
 * Only relations a human asserts are stored. Relations computable from data (feeds_into,
 * same_transformation, …) are DERIVED at query time and must never be stored (INV-11).
 */
import { z } from 'zod';
import { RelationshipIdSchema, type RecordKind } from './ids';
import { recordMetaShape, RichTextSchema } from './primitives';
import { RecordRefSchema } from './refs';

export const RELATIONSHIP_TYPES = [
  'alternative_to',
  'competing_with',
  'reverse_of',
  'commonly_confused_with',
  'mechanistically_related',
  'prerequisite_of',
  'follows',
  'contrasts_with',
  'related_to',
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** microscopic: exact reverse (equilibrium); synthetic: different reaction achieving the reverse change;
 *  conceptual: taught as opposites but not chemically each other's reverse. */
export const REVERSE_KINDS = ['microscopic', 'synthetic', 'conceptual'] as const;

export const RelationshipSchema = z.strictObject({
  id: RelationshipIdSchema,
  kind: z.literal('relationship'),
  type: z.enum(RELATIONSHIP_TYPES),
  from: RecordRefSchema,
  to: RecordRefSchema,
  /** Required for reverse_of, forbidden otherwise (REL-004). */
  reverseKind: z.enum(REVERSE_KINDS).optional(),
  note: RichTextSchema.optional(),
  ...recordMetaShape,
});
export type Relationship = z.infer<typeof RelationshipSchema>;

export interface RelationshipTypeSpec {
  /** Symmetric types are stored once and displayed once; direction carries no meaning. */
  readonly symmetric: boolean;
  /** Acyclic types report cycles (REL-005). */
  readonly acyclic: boolean;
  /** Allowed kinds for both endpoints (REL-001). */
  readonly endpointKinds: readonly RecordKind[];
  readonly label: string;
  readonly inverseLabel: string;
}

const CHEMISTRY_AND_CONCEPTS: readonly RecordKind[] = [
  'species',
  'class',
  'reagent',
  'transformation',
  'named_reaction',
  'mechanism',
  'reaction',
  'caveat',
  'route',
  'concept',
];

export const RELATIONSHIP_TYPE_SPECS = {
  alternative_to: {
    symmetric: true,
    acyclic: false,
    endpointKinds: ['reaction', 'route', 'reagent'],
    label: 'alternative to',
    inverseLabel: 'alternative to',
  },
  competing_with: {
    symmetric: true,
    acyclic: false,
    endpointKinds: ['reaction', 'mechanism'],
    label: 'competes with',
    inverseLabel: 'competes with',
  },
  reverse_of: {
    symmetric: true,
    acyclic: false,
    endpointKinds: ['reaction', 'transformation'],
    label: 'reverse of',
    inverseLabel: 'reverse of',
  },
  commonly_confused_with: {
    symmetric: true,
    acyclic: false,
    endpointKinds: ['reaction', 'species', 'class', 'reagent', 'named_reaction', 'concept', 'mechanism'],
    label: 'commonly confused with',
    inverseLabel: 'commonly confused with',
  },
  mechanistically_related: {
    symmetric: true,
    acyclic: false,
    endpointKinds: ['reaction', 'mechanism', 'named_reaction'],
    label: 'mechanistically related to',
    inverseLabel: 'mechanistically related to',
  },
  prerequisite_of: {
    symmetric: false,
    acyclic: true,
    endpointKinds: ['concept', 'reaction', 'named_reaction', 'mechanism'],
    label: 'prerequisite of',
    inverseLabel: 'requires',
  },
  follows: {
    symmetric: false,
    acyclic: false,
    endpointKinds: ['reaction', 'named_reaction'],
    label: 'typically follows',
    inverseLabel: 'typically followed by',
  },
  contrasts_with: {
    symmetric: true,
    acyclic: false,
    endpointKinds: ['reaction', 'named_reaction', 'mechanism', 'concept', 'reagent'],
    label: 'contrasts with',
    inverseLabel: 'contrasts with',
  },
  related_to: {
    symmetric: true,
    acyclic: false,
    endpointKinds: CHEMISTRY_AND_CONCEPTS,
    label: 'related to',
    inverseLabel: 'related to',
  },
} as const satisfies Record<RelationshipType, RelationshipTypeSpec>;

/** Computed by src/core/graph from canonical data; storing any of these is a schema violation by design. */
export const DERIVED_RELATIONS = [
  'feeds_into',
  'same_transformation',
  'same_reagent_family',
  'same_named_family',
  'shares_mechanism',
  'shares_participant',
] as const;
