/**
 * Graph engine contracts — docs/GRAPH_SEMANTICS.md.
 * The canonical graph is a bipartite hypergraph: substance nodes ↔ reaction nodes. Every view is a
 * PROJECTION computed from canonical data + indexes; projections are never stored (INV-11).
 * Edges are never deduplicated by endpoints (INV-26); parallel edges are bundled visually only.
 */
import type {
  AnchorTone,
  CanonicalState,
  ConditionVariantId,
  GridCell,
  OutcomeId,
  ParticipantId,
  ProductId,
  ReactionId,
  RecordKind,
  RecordRef,
  RelationshipId,
  RelationshipType,
  SpeciesOrClassRef,
  SubstanceRef,
  ViewFilters,
  ViewKey,
} from '../schema';
import type { ReadonlyIndexes } from '../indexes/contracts';

export type GraphNodeKind =
  | 'species'
  | 'class'
  | 'reagent'
  | 'reaction'
  | 'concept'
  | 'named_reaction'
  | 'mechanism'
  | 'topic'
  | 'virtual';

export type NodeFlag =
  | 'has_caveat'
  | 'has_mechanism'
  | 'review_required'
  | 'has_warning'
  | 'has_error'
  | 'outside_scope'
  | 'unanchored'
  | 'no_structure';

/**
 * The curated arrangement of a navigator hub (step 5.5c; additive): what its anchor says about where it sits on the overview grid,
 * which family group it belongs to and that group's tone. Copied from the anchor (the lowest `order`, then ID, when a target has
 * several), never stored: a projection is derived data.
 */
export interface NodeArrangement {
  readonly cell?: GridCell;
  readonly group?: string;
  readonly tone?: AnchorTone;
}

export interface GraphNode {
  /** Record ID, or "virtual:<purpose>:<key>" (e.g. the Unclassified hub, "+12 more" overflow). */
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly record?: RecordRef;
  readonly role: 'anchor' | 'focus' | 'member' | 'overflow' | 'unclassified';
  /** Hops from the nearest focus/anchor inside this projection. */
  readonly depth: number;
  /** Neighbours not shown because of expansion state or limits. */
  readonly hidden: { readonly outgoing: number; readonly incoming: number };
  /** Navigator overflow nodes only (step 5.4c): how many hub members the node stands for; `hidden` counts their arrows. */
  readonly hiddenMembers?: number;
  readonly flags: readonly NodeFlag[];
  /** Navigator hubs only: the arrangement of the hub's anchor, when it has one (step 5.5c). */
  readonly arrangement?: NodeArrangement;
}

export type EdgeSemantic =
  | 'consumes'
  | 'produces'
  | 'transforms_to'
  | 'uses_reagent'
  /** A reaction (or one of its outcomes, via `outcomeId`) links to a mechanism/variant (ADR-029, `mechanisms` view). */
  | 'uses_mechanism'
  | 'instance_of'
  | 'membership'
  | 'relationship'
  | 'prerequisite'
  /** A degree-cap overflow edge (GRAPH_SEMANTICS.md §11): stands for several collapsed neighbours, never one real
   *  participation/production, so it carries no `reactionId` (ADR-028). */
  | 'overflow';

export interface GraphEdge {
  /** Deterministic: hash(view, from, to, semantic, reactionId, outcomeId, productId, participantId, relationshipId). */
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly semantic: EdgeSemantic;
  readonly reactionId?: ReactionId;
  readonly outcomeId?: OutcomeId;
  readonly productId?: ProductId;
  readonly participantId?: ParticipantId;
  readonly relationshipId?: RelationshipId;
  readonly relationshipType?: RelationshipType;
  readonly selectivity?: 'exclusive' | 'major' | 'minor' | 'trace' | 'mixture_component' | 'unspecified';
  readonly conditionVariantIds: readonly ConditionVariantId[];
  /** True when computed from class membership rather than stated; drawn as inferred (GRAPH_SEMANTICS.md §4). */
  readonly inferred: boolean;
  /** Precursor views lay out right-to-left, but arrows always point in the chemical direction. */
  readonly layoutDirection: 'forward' | 'reversed';
}

export interface EdgeBundle {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** The edges drawn for this pair: every arrow of the pair, or the best-ranked ones when `total` is larger. */
  readonly edgeIds: readonly string[];
  /** How many arrows the pair has after the request's filters (step 5.4c); `edgeIds.length` for the other views. */
  readonly total: number;
}

export interface Truncation {
  readonly reason: 'max_nodes' | 'max_edges' | 'max_depth' | 'time_budget' | 'aborted';
  readonly hiddenNodeEstimate: number;
  /** Navigator only (step 5.4c): ordered node pairs that no drawn pair represents. */
  readonly hiddenPairs?: number;
  /** Navigator only (step 5.4c): arrows (candidates) that no drawn pair represents. */
  readonly hiddenEdges?: number;
}

export interface Projection {
  readonly view: ViewKey;
  readonly revision: number;
  /** Stable cache key: hash of request + revision of every dependency record. */
  readonly key: string;
  /** Sorted by id for determinism (INV-19 analogue for projections). */
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly bundles: readonly EdgeBundle[];
  /** Reactions not reachable from any anchor in this view — always listed, never silently hidden. */
  readonly unanchoredReactionIds: readonly ReactionId[];
  readonly truncation: Truncation | null;
}

export interface TraversalLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxEdges: number;
  readonly timeBudgetMs: number;
  readonly signal?: AbortSignal;
}

/** Neighbours shown per node per direction before a "+N more" overflow node appears (GRAPH_SEMANTICS.md §11). */
export const DEFAULT_DEGREE_CAP = 12;

export const DEFAULT_TRAVERSAL_LIMITS: TraversalLimits = {
  maxDepth: 12,
  maxNodes: 400,
  maxEdges: 800,
  timeBudgetMs: 12,
};

export interface ExpansionState {
  /** Node IDs whose neighbours are revealed, with the direction revealed. */
  readonly expanded: readonly { readonly nodeId: string; readonly direction: 'out' | 'in' | 'both' }[];
  /** Edge IDs the user collapsed ("broken edges" in v6). */
  readonly collapsedEdgeIds: readonly string[];
}

export interface ProjectionRequest {
  readonly view: ViewKey;
  readonly focus: readonly RecordRef[];
  readonly expansion: ExpansionState;
  readonly filters: ViewFilters;
  readonly limits: TraversalLimits;
  /**
   * Bipartite reaction views only (`reaction_explorer`, `precursor_explorer`; docs/GRAPH_SEMANTICS.md §7):
   * restrict participants and outcomes to those that hold under this condition variant (common ones,
   * listed under no variant, always show). Undefined shows every variant. Not persisted in `ViewFilters`:
   * it names a part *within* one reaction, not a cross-reaction filter (ADR-027, docs/PROGRESS.md "Amendments").
   */
  readonly conditionVariantId?: ConditionVariantId;
}

export interface ProjectionContext {
  readonly state: CanonicalState;
  readonly indexes: ReadonlyIndexes;
  /** Derived exam scope lookup for the active exam version (docs/JEE_ONTOLOGY.md §4). */
  scopeOf(ref: RecordRef): 'official' | 'prerequisite' | 'enrichment' | 'outside' | 'unmapped';
}

/** Projections are registered, not hard-coded: adding a view never edits existing projections. */
export interface ProjectionDefinition {
  readonly view: ViewKey;
  readonly description: string;
  /**
   * The record kinds `build` reads (step 5.4c, decision Q3). A commit that touches none of them cannot change
   * the projection, apart from its revision and key. Undefined: rebuild on every commit.
   */
  readonly readsKinds?: readonly RecordKind[];
  build(ctx: ProjectionContext, request: ProjectionRequest): Projection;
}

/** GRAPH_SEMANTICS.md §9 defaults for `RouteQuery.maxSteps` / `maxRoutes`; callers may override either. */
export const DEFAULT_ROUTE_MAX_STEPS = 5;
export const DEFAULT_ROUTE_MAX_ROUTES = 10;

export interface RouteQuery {
  readonly target: SpeciesOrClassRef;
  readonly maxSteps: number;
  readonly maxRoutes: number;
  /** Optional starting materials; otherwise any source is acceptable. */
  readonly startFrom?: readonly SubstanceRef[];
  /** side_inputs_available: reagents/co-reactants not produced within the route are assumed available. */
  readonly assumption: 'side_inputs_available' | 'only_listed_inputs';
  readonly excludeReactionIds?: readonly ReactionId[];
  readonly limits: TraversalLimits;
}

export interface FoundRouteStep {
  readonly reactionId: ReactionId;
  readonly outcomeId: OutcomeId;
  readonly conditionVariantIds: readonly ConditionVariantId[];
  readonly carriedIn: RecordRef;
  readonly carriedOut: RecordRef;
  readonly sideInputs: readonly RecordRef[];
  /** e.g. "minor product", "class-level match (inferred)". */
  readonly warnings: readonly string[];
}

export interface FoundRoute {
  /** Deterministic key from the step sequence. */
  readonly key: string;
  readonly steps: readonly FoundRouteStep[];
  readonly score: number;
}

export interface RouteSearchResult {
  readonly routes: readonly FoundRoute[];
  readonly explored: number;
  readonly truncation: Truncation | null;
}
