/**
 * Derived indexes — docs/GRAPH_SEMANTICS.md §8 and docs/PERFORMANCE_ARCHITECTURE.md §4.
 * Indexes are never persisted as canonical data (INV-11). `apply` updates incrementally from a
 * ChangeSet; a property test asserts apply(...) ≡ build(...) after random command sequences (INV-18).
 */
import type {
  AnyRecord,
  ClassId,
  ConceptId,
  EntityDisplay,
  MechanismId,
  NamedReactionId,
  NavigatorAnchor,
  OutcomeId,
  ParticipantId,
  ParticipantRole,
  ProductId,
  ReactionId,
  ReagentFamily,
  ReagentId,
  RecordKind,
  RecordRef,
  TopicId,
  TransformationId,
} from '../schema';
import type { CanonicalState } from '../schema';
import type { ChangeSet } from '../dataset/contracts';
import type { Referrer } from '../references/contracts';

export interface Participation {
  readonly reactionId: ReactionId;
  readonly participantId: ParticipantId;
  readonly role: ParticipantRole;
}

export interface Production {
  readonly reactionId: ReactionId;
  readonly outcomeId: OutcomeId;
  readonly productId: ProductId;
  readonly selectivity: string;
  readonly productRole: 'main' | 'coproduct' | 'byproduct';
}

/** Kinds with a parent hierarchy (HIER-001): class, concept and named-reaction DAGs, the topic tree. */
export type HierarchyKind = 'class' | 'concept' | 'named_reaction' | 'topic';

/**
 * Part 1 of the indexes (step 1.6): everything that depends only on a record's own content.
 * `ReadonlyIndexes` extends it with the cross-record indexes added in step 2.1.
 *
 * Ownership: `IndexEngine.apply` updates in place and returns the handle for the new revision;
 * the `previous` handle is then stale and throws on use. This keeps a commit O(changed records).
 */
export interface CoreIndexes {
  readonly revision: number;
  get(id: string): AnyRecord | undefined;
  /** Reverse references for record IDs and nested IDs, sorted by owner ID then path. */
  referrersOf(id: string): readonly Referrer[];
  /** Records of `kind` whose folded name or alias equals `folded` (see core/text), sorted by ID. */
  byFoldedName(kind: RecordKind, folded: string): readonly RecordRef[];
  /** Transitive parents, nearest first (breadth-first, `parentIds` order), never including `id` itself. */
  ancestorsOf(kind: HierarchyKind, id: string): readonly string[];
  /** Transitive children, nearest first (breadth-first, ID order), never including `id` itself. */
  descendantsOf(kind: HierarchyKind, id: string): readonly string[];
  classAncestors(id: ClassId): readonly ClassId[];
}

export interface ReadonlyIndexes extends CoreIndexes {
  participationsOf(substance: RecordRef): readonly Participation[];
  productionsOf(product: RecordRef): readonly Production[];
  reactionsByReagent(id: ReagentId): readonly ReactionId[];
  reactionsByReagentFamily(family: ReagentFamily): readonly ReactionId[];
  reactionsByNamedReaction(id: NamedReactionId, opts: { readonly includeDescendants: boolean }): readonly ReactionId[];
  reactionsByTransformation(id: TransformationId): readonly ReactionId[];
  reactionsByConcept(id: ConceptId, opts: { readonly includeDescendants: boolean }): readonly ReactionId[];
  reactionsByMechanism(id: MechanismId): readonly ReactionId[];
  speciesInClass(id: ClassId, opts: { readonly transitive: boolean }): readonly RecordRef[];
  recordsInTopic(id: TopicId, opts: { readonly transitive: boolean }): readonly RecordRef[];
  topicsOf(ref: RecordRef): readonly TopicId[];
  relationshipsOf(ref: RecordRef): readonly RecordRef[];
  caveatsFor(ref: RecordRef): readonly RecordRef[];
  anchors(): readonly NavigatorAnchor[];
  displayOf(ref: RecordRef): EntityDisplay | undefined;
}

export interface IndexEngine {
  build(state: CanonicalState, revision?: number): ReadonlyIndexes;
  apply(previous: ReadonlyIndexes, changes: ChangeSet, next: CanonicalState): ReadonlyIndexes;
}

/** The part-1 engine; `revision` defaults to 0. Same semantics as `IndexEngine`. */
export interface CoreIndexEngine {
  build(state: CanonicalState, revision?: number): CoreIndexes;
  apply(previous: CoreIndexes, changes: ChangeSet, next: CanonicalState): CoreIndexes;
}
