/**
 * Hub expansion (step 5.4c; docs/GRAPH_SEMANTICS.md §3, §11). An expanded hub shows its MEMBERS: the substances
 * that resolve to the hub and are the carried substrate (direction out) or a main product (direction in) of the
 * hub's arrows. A substance that IS the hub record is not a member. At most DEFAULT_DEGREE_CAP members per hub
 * and direction are shown, ranked by their number of arrows, then ID; the rest stay inside the hub's own pairs
 * and are announced by one overflow node (ADR-028). Members and overflow nodes use up the node budget (and, one
 * structural edge each, the edge budget): hubs are expanded in ID order and the first that does not fit, and every
 * hub after it, is left unexpanded and reported. Pure; the ExpansionState entries are the only input.
 */
import type { NavigatorCandidate, NavigatorRollupIndex } from '../../indexes/contracts';
import type { RecordRef } from '../../schema';
import { DEFAULT_DEGREE_CAP, type ProjectionRequest } from '../contracts';
import type { Arrow, Pair } from './pairs';

export interface HubExpansion {
  readonly hubId: string;
  /** Members shown for the out direction (their arrows start at the member) and for the in direction. */
  readonly shownOut: ReadonlySet<string>;
  readonly shownIn: ReadonlySet<string>;
  /** Every shown member, sorted by ID. */
  readonly members: readonly RecordRef[];
  /** Members with an arrow that stayed in the hub's own pairs, and those arrows. Null when nothing stayed. */
  readonly overflow: { readonly members: number; readonly outgoing: number; readonly incoming: number } | null;
}

export interface ExpansionPlan {
  readonly hubs: ReadonlyMap<string, HubExpansion>;
  /** Members of the hubs whose expansion was not applied for lack of budget. */
  readonly unappliedMembers: number;
  readonly unappliedBy: 'max_nodes' | 'max_edges' | null;
}

export const NO_EXPANSION: ExpansionPlan = { hubs: new Map(), unappliedMembers: 0, unappliedBy: null };

interface Tally {
  readonly ref: RecordRef;
  arrows: number;
}

const compareTally = (a: Tally, b: Tally): number => b.arrows - a.arrows || (a.ref.id < b.ref.id ? -1 : a.ref.id > b.ref.id ? 1 : 0);

function tally(into: Map<string, Map<string, Tally>>, hubId: string, ref: RecordRef): void {
  if (ref.id === hubId) return;
  let members = into.get(hubId);
  if (members === undefined) {
    members = new Map();
    into.set(hubId, members);
  }
  const entry = members.get(ref.id);
  if (entry === undefined) members.set(ref.id, { ref, arrows: 1 });
  else entry.arrows += 1;
}

const ranked = (members: ReadonlyMap<string, Tally> | undefined): Tally[] => [...(members?.values() ?? [])].sort(compareTally);
const sum = (list: readonly Tally[]): number => list.reduce((total, entry) => total + entry.arrows, 0);

/**
 * Plans the expansion of `request.expansion.expanded` over the candidates of the expanded hubs that `accept` (the
 * request's filters). Entries that name no
 * admitted hub are ignored (a stale entry is not an error); two entries for one hub are merged. `budget` is what
 * the hubs left of `maxNodes` and `maxEdges`.
 */
export function planExpansion(
  rollup: NavigatorRollupIndex,
  request: ProjectionRequest,
  accept: (candidate: NavigatorCandidate) => boolean,
  admittedHubs: ReadonlySet<string>,
  budget: { readonly nodes: number; readonly edges: number },
): ExpansionPlan {
  const wanted = new Map<string, { out: boolean; in: boolean }>();
  for (const entry of request.expansion.expanded) {
    if (!admittedHubs.has(entry.nodeId)) continue;
    const want = wanted.get(entry.nodeId) ?? { out: false, in: false };
    if (entry.direction !== 'in') want.out = true;
    if (entry.direction !== 'out') want.in = true;
    wanted.set(entry.nodeId, want);
  }
  if (wanted.size === 0) return NO_EXPANSION;

  const outTally = new Map<string, Map<string, Tally>>();
  const inTally = new Map<string, Map<string, Tally>>();
  for (const [hubId, want] of wanted) {
    if (want.out) for (const candidate of rollup.candidatesFrom(hubId)) if (accept(candidate)) tally(outTally, hubId, candidate.substrate);
    if (want.in) for (const candidate of rollup.candidatesTo(hubId)) if (accept(candidate)) tally(inTally, hubId, candidate.product);
  }

  const hubs = new Map<string, HubExpansion>();
  let nodesLeft = budget.nodes;
  let edgesLeft = budget.edges;
  let unappliedMembers = 0;
  let unappliedBy: ExpansionPlan['unappliedBy'] = null;
  for (const hubId of [...wanted.keys()].sort()) {
    const out = ranked(outTally.get(hubId));
    const inn = ranked(inTally.get(hubId));
    const shownOut = out.slice(0, DEFAULT_DEGREE_CAP);
    const shownIn = inn.slice(0, DEFAULT_DEGREE_CAP);
    const hiddenOut = out.slice(DEFAULT_DEGREE_CAP);
    const hiddenIn = inn.slice(DEFAULT_DEGREE_CAP);
    const shown = new Map<string, RecordRef>([...shownOut, ...shownIn].map((entry) => [entry.ref.id, entry.ref]));
    const hiddenIds = new Set([...hiddenOut, ...hiddenIn].map((entry) => entry.ref.id));
    const cost = shown.size + (hiddenIds.size > 0 ? 1 : 0);
    if (cost === 0) continue;
    if (unappliedBy !== null || cost > nodesLeft || cost > edgesLeft) {
      unappliedBy ??= cost > nodesLeft ? 'max_nodes' : 'max_edges';
      unappliedMembers += new Set([...out, ...inn].map((entry) => entry.ref.id)).size;
      continue;
    }
    nodesLeft -= cost;
    edgesLeft -= cost;
    hubs.set(hubId, {
      hubId,
      shownOut: new Set(shownOut.map((entry) => entry.ref.id)),
      shownIn: new Set(shownIn.map((entry) => entry.ref.id)),
      members: [...shown.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      overflow: hiddenIds.size > 0 ? { members: hiddenIds.size, outgoing: sum(hiddenOut), incoming: sum(hiddenIn) } : null,
    });
  }
  return { hubs, unappliedMembers, unappliedBy };
}

/** The arrow a candidate is drawn as: its ends move from a hub to a shown member of that hub. */
export function arrowOf(plan: ExpansionPlan, candidate: NavigatorCandidate): Arrow {
  const out = plan.hubs.get(candidate.fromHub)?.shownOut;
  const inn = plan.hubs.get(candidate.toHub)?.shownIn;
  return {
    from: out?.has(candidate.substrate.id) === true ? candidate.substrate.id : candidate.fromHub,
    to: inn?.has(candidate.product.id) === true ? candidate.product.id : candidate.toHub,
    candidate,
  };
}

/** True when some arrow of the pair moves: its from hub shows out-members or its to hub shows in-members. */
export function movesArrows(plan: ExpansionPlan, pair: Pair): boolean {
  return (plan.hubs.get(pair.from)?.shownOut.size ?? 0) > 0 || (plan.hubs.get(pair.to)?.shownIn.size ?? 0) > 0;
}
