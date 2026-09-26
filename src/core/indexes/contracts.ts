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

export interface ReadonlyIndexes {
  readonly revision: number;
  get(id: string): AnyRecord | undefined;
  /** Reverse references for record IDs and nested IDs. */
  referrersOf(id: string): readonly Referrer[];
  participationsOf(substance: RecordRef): readonly Participation[];
  productionsOf(product: RecordRef): readonly Production[];
  reactionsByReagent(id: ReagentId): readonly ReactionId[];
  reactionsByReagentFamily(family: ReagentFamily): readonly ReactionId[];
  reactionsByNamedReaction(id: NamedReactionId, opts: { readonly includeDescendants: boolean }): readonly ReactionId[];
  reactionsByTransformation(id: TransformationId): readonly ReactionId[];
  reactionsByConcept(id: ConceptId, opts: { readonly includeDescendants: boolean }): readonly ReactionId[];
  reactionsByMechanism(id: MechanismId): readonly ReactionId[];
  speciesInClass(id: ClassId, opts: { readonly transitive: boolean }): readonly RecordRef[];
  classAncestors(id: ClassId): readonly ClassId[];
  recordsInTopic(id: TopicId, opts: { readonly transitive: boolean }): readonly RecordRef[];
  topicsOf(ref: RecordRef): readonly TopicId[];
  relationshipsOf(ref: RecordRef): readonly RecordRef[];
  caveatsFor(ref: RecordRef): readonly RecordRef[];
  /** Records of `kind` whose folded canonical name or alias equals `folded` (see core/text). */
  byFoldedName(kind: RecordKind, folded: string): readonly RecordRef[];
  anchors(): readonly NavigatorAnchor[];
  displayOf(ref: RecordRef): EntityDisplay | undefined;
}

export interface IndexEngine {
  build(state: CanonicalState): ReadonlyIndexes;
  apply(previous: ReadonlyIndexes, changes: ChangeSet, next: CanonicalState): ReadonlyIndexes;
}
