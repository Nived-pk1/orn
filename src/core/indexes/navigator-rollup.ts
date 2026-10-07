/**
 * Navigator roll-up index (docs/IMPLEMENTATION_PLAN.md §2 step 2.9; GRAPH_SEMANTICS.md §3). Precomputes,
 * per reaction, the navigator's hub-level contribution — source/target hubs, main-product candidates, and
 * Unclassified/Unanchored membership — so the navigator projection no longer scans every reaction in the
 * state on every build (the O(total reactions) cost measured in the Gate B packet). Aggregated per hub
 * pair (stored under both endpoints, `byFromHub` and `byToHub`, so either side of a pair is an O(1) lookup);
 * `apply` updates it from each ChangeSet the same way the other cross-record tables do (retract-then-add
 * per touched reaction), except for the two cases carved out in the step 2.9 plan:
 *  - a class-membership change (a species' or reagent's `classIds`) invalidates only that ref's memoised
 *    hub resolution and recomputes only the reactions that reference it (`participationsOf`/`productionsOf`);
 *  - an anchor, class-hierarchy or display change can shift hub resolution for reactions with no direct
 *    reference to the changed record, so those rebuild this index only (not the whole `IndexEngine`).
 *
 * Step 5.4c adds a per-pair table (`pair-table.ts`: every ordered hub pair with its candidates ranked for
 * drawing) kept in the same retract-then-add step, and candidates now carry their substrate and product refs.
 *
 * Hub resolution itself (`HubResolver`) and the "what does this reaction carry" selection
 * (`primarySubstrateOf`/`mainProductsOf`) are pure functions of a `HubBasis` (anchors, `get`, `displayOf`)
 * — the same shape `core/graph/navigator/hubs.ts` and `select.ts` used against `ReadonlyIndexes` before this
 * step, now living here because building this index needs them and `core/indexes` cannot import
 * `core/graph` (that would be a cycle: `core/graph` already imports `core/indexes`). The graph-layer
 * modules now re-export or delegate to these (see the amendment note in docs/PROGRESS.md).
 */
import type { AnyRecord, ClassId, EntityDisplay, NavigatorAnchor, Outcome, Participant, Product, Reaction, ReactionId, RecordRef } from '../schema';
import { PairTable, type NavigatorCandidate, type NavigatorPair } from './pair-table';
import { compareStrings, Table } from './table';

export type { NavigatorCandidate } from './pair-table';

export const UNCLASSIFIED_HUB_ID = 'virtual:unclassified:hub';

export interface HubResolution {
  /** Node ID of the hub: the anchored record's ID, or `UNCLASSIFIED_HUB_ID`. */
  readonly hubId: string;
  /** The anchored record, or null for Unclassified. */
  readonly hub: RecordRef | null;
  /** True when attachment goes through class membership (drawn dotted); false when stated. */
  readonly inferred: boolean;
}

/** Whatever `drawnAsNode` needs — satisfied directly by `ReadonlyIndexes` (a method, like here, not a
 * plain property), so graph-layer callers can pass `ctx.indexes` without adapting it. */
export interface DisplaySource {
  displayOf(ref: RecordRef): EntityDisplay | undefined;
}

/** What building this index needs — a small, `core/graph`-free slice of `ReadonlyIndexes`. */
export interface HubBasis extends DisplaySource {
  readonly anchors: readonly NavigatorAnchor[];
  get(id: string): AnyRecord | undefined;
}

const byRefId = (a: RecordRef, b: RecordRef): number => compareStrings(a.id, b.id);
const compareCandidates = (a: NavigatorCandidate, b: NavigatorCandidate): number =>
  compareStrings(a.reactionId, b.reactionId) || compareStrings(a.outcomeId, b.outcomeId) || compareStrings(a.productId, b.productId);

const UNCLASSIFIED: HubResolution = { hubId: UNCLASSIFIED_HUB_ID, hub: null, inferred: false };
const uniqueSorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

/** Records that can be hubs: anchored, present, and not `showAsNode = never`. First anchor wins ties. */
export function hubTargets(basis: HubBasis): ReadonlyMap<string, RecordRef> {
  const targets = new Map<string, RecordRef>();
  for (const anchor of basis.anchors) {
    const { target } = anchor;
    if (basis.get(target.id) === undefined) continue;
    if (basis.displayOf(target)?.showAsNode === 'never') continue;
    if (!targets.has(target.id)) targets.set(target.id, target);
  }
  return targets;
}

function parentsOf(basis: HubBasis, id: string): readonly string[] {
  const record = basis.get(id);
  return record?.kind === 'class' ? record.parentIds : [];
}

function startingClasses(basis: HubBasis, ref: RecordRef): readonly string[] {
  const record = basis.get(ref.id);
  if (record === undefined) return [];
  if (record.kind === 'species' || record.kind === 'reagent') return record.classIds;
  if (record.kind === 'class') return record.parentIds;
  return [];
}

/**
 * Resolves a substance/class to its navigator hub (docs/GRAPH_SEMANTICS.md §3: the anchored record itself;
 * else the nearest anchored ancestor class; else Unclassified). Memoised per instance; `invalidate` drops
 * one ref's cached resolution when its own class membership changes, without touching anything else's.
 */
export class HubResolver {
  private readonly memo = new Map<string, HubResolution>();

  constructor(
    private basis: HubBasis,
    readonly targets: ReadonlyMap<string, RecordRef>,
  ) {}

  resolve(ref: RecordRef): HubResolution {
    const cached = this.memo.get(ref.id);
    if (cached !== undefined) return cached;
    const found = this.climb(ref);
    this.memo.set(ref.id, found);
    return found;
  }

  /** Drops the memoised resolution for `id` (its own class membership changed); recomputed on next `resolve`. */
  invalidate(id: string): void {
    this.memo.delete(id);
  }

  /**
   * Points this resolver at a fresher `HubBasis` (a new commit's indexes) without touching `targets` or
   * the memo — both stay valid across a commit that changes neither the hub set nor class membership.
   * `basis.get`/`basis.displayOf` close over one commit's index handle, which goes stale on the next
   * commit (docs/PROGRESS.md step 2.9): the roll-up outlives many commits, so it must be rebound, not
   * recreated, on every `apply()` that does not already replace it wholesale.
   */
  rebind(basis: HubBasis): void {
    this.basis = basis;
  }

  private climb(ref: RecordRef): HubResolution {
    const own = this.targets.get(ref.id);
    if (own !== undefined) return { hubId: own.id, hub: own, inferred: false };
    const visited = new Set<string>();
    let frontier = uniqueSorted(startingClasses(this.basis, ref));
    while (frontier.length > 0) {
      for (const id of frontier) visited.add(id);
      const hit = frontier.find((id) => this.targets.has(id));
      if (hit !== undefined) return { hubId: hit, hub: this.targets.get(hit) as RecordRef, inferred: true };
      frontier = uniqueSorted(frontier.flatMap((id) => parentsOf(this.basis, id as ClassId))).filter((id) => !visited.has(id));
    }
    return UNCLASSIFIED;
  }
}

const isDrawnAsNode = (basis: DisplaySource, ref: RecordRef): boolean => basis.displayOf(ref)?.showAsNode !== 'never';

/**
 * The carried-through substrate: the participant flagged `isPrimarySubstrate`, else the first reactant.
 * Spectators never qualify, and neither does a participant that is never drawn as a node (water).
 */
export function primarySubstrateOf(basis: DisplaySource, reaction: Reaction): Participant | undefined {
  const usable = reaction.participants.filter((p) => p.role !== 'spectator' && isDrawnAsNode(basis, p.ref));
  return usable.find((p) => p.isPrimarySubstrate === true) ?? usable.find((p) => p.role === 'reactant');
}

export interface MainProductOf {
  readonly outcome: Outcome;
  readonly product: Product;
}

/** Main products of every outcome in array order, except those never drawn as nodes. */
export function mainProductsOf(basis: DisplaySource, reaction: Reaction): MainProductOf[] {
  return reaction.outcomes.flatMap((outcome) =>
    outcome.products.filter((p) => p.role === 'main' && isDrawnAsNode(basis, p.ref)).map((product) => ({ outcome, product })),
  );
}

/**
 * The navigator's precomputed hub roll-up for one state. `hubs` and hub resolution are fixed at
 * construction (rebuilt whenever an anchor/class-hierarchy/display change makes them stale — see
 * `full.ts`); `addReaction`/`removeReaction` are the incremental per-reaction update for everything else.
 */
export class NavigatorRollup {
  readonly hubs: readonly RecordRef[];
  private readonly resolver: HubResolver;
  private readonly byFromHub = new Table<NavigatorCandidate>(compareCandidates);
  private readonly byToHub = new Table<NavigatorCandidate>(compareCandidates);
  private readonly byPair = new PairTable();
  private readonly unanchored = new Set<ReactionId>();

  constructor(private basis: HubBasis) {
    const targets = hubTargets(basis);
    this.hubs = [...targets.values()].sort(byRefId);
    this.resolver = new HubResolver(basis, targets);
  }

  /** Every hub ID a candidate could possibly be filed under: real hubs plus the virtual Unclassified one. */
  get hubIds(): readonly string[] {
    return [...this.hubs.map((hub) => hub.id), UNCLASSIFIED_HUB_ID];
  }

  /** See `HubResolver.rebind`: points this roll-up (and its resolver) at the current commit's indexes. */
  rebind(basis: HubBasis): void {
    this.basis = basis;
    this.resolver.rebind(basis);
  }

  addReaction(reaction: Reaction): void {
    const substrate = primarySubstrateOf(this.basis, reaction);
    const from = substrate === undefined ? undefined : this.resolver.resolve(substrate.ref);
    let reached = false;
    if (substrate !== undefined && from !== undefined) {
      for (const { outcome, product } of mainProductsOf(this.basis, reaction)) {
        const to = this.resolver.resolve(product.ref);
        const candidate: NavigatorCandidate = {
          fromHub: from.hubId,
          toHub: to.hubId,
          inferred: from.inferred || to.inferred,
          reactionId: reaction.id,
          outcomeId: outcome.id,
          productId: product.id,
          participantId: substrate.id,
          selectivity: outcome.selectivity,
          conditionVariantIds: outcome.conditionVariantIds,
          substrate: substrate.ref,
          product: product.ref,
        };
        this.byFromHub.add(reaction.id, candidate.fromHub, candidate);
        this.byToHub.add(reaction.id, candidate.toHub, candidate);
        this.byPair.add(candidate);
        reached ||= from.hub !== null || to.hub !== null;
      }
    }
    if (reached) this.unanchored.delete(reaction.id);
    else this.unanchored.add(reaction.id);
  }

  removeReaction(id: string): void {
    this.byFromHub.removeOwner(id);
    this.byToHub.removeOwner(id);
    this.byPair.removeOwner(id);
    this.unanchored.delete(id as ReactionId);
  }

  /** Drops the memoised hub resolution for `id` (its own class membership changed). */
  invalidateHubResolution(id: string): void {
    this.resolver.invalidate(id);
  }

  /** Publishes every `addReaction`/`removeReaction` since the last `commit()`. */
  commit(): void {
    this.byFromHub.commit();
    this.byToHub.commit();
    this.byPair.commit();
  }

  candidatesFrom(hubId: string): readonly NavigatorCandidate[] {
    return this.byFromHub.get(hubId);
  }

  candidatesTo(hubId: string): readonly NavigatorCandidate[] {
    return this.byToHub.get(hubId);
  }

  /** Every ordered hub pair with its ranked candidates, largest first (step 5.4c); see `PairTable`. */
  pairs(): readonly NavigatorPair[] {
    return this.byPair.pairs();
  }

  get unanchoredReactionIds(): readonly ReactionId[] {
    return [...this.unanchored].sort(compareStrings);
  }
}
