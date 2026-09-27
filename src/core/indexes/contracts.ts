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
import type { NavigatorCandidate } from './navigator-rollup';

export type { NavigatorCandidate } from './navigator-rollup';

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
  /**
   * Records that define the nested ID `id` (NESTED_ID_SPECS), each listed once, sorted by ID. More than
   * one entry, or an entry for a record that is not the caller, is a duplicate ID (REF-006, INV-01).
   */
  definersOf(id: string): readonly RecordRef[];
  /** Records whose rich text links to `id` with `[[…]]` (soft references: REF-008), each once, sorted by ID. */
  linkersOf(id: string): readonly RecordRef[];
  /** Records of `kind` whose folded name or alias equals `folded` (see core/text), sorted by ID. */
  byFoldedName(kind: RecordKind, folded: string): readonly RecordRef[];
  /** Transitive parents, nearest first (breadth-first, `parentIds` order), never including `id` itself. */
  ancestorsOf(kind: HierarchyKind, id: string): readonly string[];
  /** Transitive children, nearest first (breadth-first, ID order), never including `id` itself. */
  descendantsOf(kind: HierarchyKind, id: string): readonly string[];
  classAncestors(id: ClassId): readonly ClassId[];
}

/**
 * Additive contract change, step 2.9 (docs/PROGRESS.md Amendments): the navigator's precomputed hub
 * roll-up (docs/IMPLEMENTATION_PLAN.md §2), so `navigatorProjection.build` reads it instead of scanning
 * every reaction in the state. `hubs` is every real, anchored, drawable hub (sorted by ID); a candidate's
 * `fromHub`/`toHub` is one of `hubs`' IDs or the virtual Unclassified hub ID (`UNCLASSIFIED_HUB_ID`,
 * `src/core/indexes/navigator-rollup.ts`). Cost of reading it is proportional to hubs and output, not to
 * total reactions in the state.
 */
export interface NavigatorRollupIndex {
  readonly hubs: readonly RecordRef[];
  readonly unanchoredReactionIds: readonly ReactionId[];
  /** Candidates whose carried substrate resolved to this hub, sorted by (reaction, outcome, product). */
  candidatesFrom(hubId: string): readonly NavigatorCandidate[];
  /** Candidates whose main product resolved to this hub, sorted by (reaction, outcome, product). */
  candidatesTo(hubId: string): readonly NavigatorCandidate[];
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
  navigatorRollup(): NavigatorRollupIndex;
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
