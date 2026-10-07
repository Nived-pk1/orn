/**
 * The navigator overview is built per ordered node PAIR (step 5.4c; docs/GRAPH_SEMANTICS.md §11): the
 * arrows between the same two nodes are one pair with a full count. A pair is drawn as one path; which of its
 * arrows are materialised as edges is decided here. Pure functions over candidates; no state, no clock.
 */
import { compareRank, comparePairs } from '../../indexes/pair-table';
import type { NavigatorCandidate } from '../../indexes/contracts';
import { compareStrings } from '../../indexes/table';
import { DEFAULT_DEGREE_CAP } from '../contracts';

export { compareRank };

/** An arrow candidate with the node IDs it is drawn between (hubs, or members of expanded hubs). */
export interface Arrow {
  readonly from: string;
  readonly to: string;
  readonly candidate: NavigatorCandidate;
}

export interface Pair {
  readonly from: string;
  readonly to: string;
  readonly candidates: readonly NavigatorCandidate[];
  /** True when `candidates` is in no particular order; a pair read from the roll-up's pair table is already ranked. */
  readonly unranked?: boolean;
}

/** One pair per distinct (from, to); the order of the result is unspecified. */
export function groupPairs(arrows: Iterable<Arrow>): Pair[] {
  const byFrom = new Map<string, Map<string, NavigatorCandidate[]>>();
  const pairs: { from: string; to: string; candidates: NavigatorCandidate[]; unranked: true }[] = [];
  for (const arrow of arrows) {
    let inner = byFrom.get(arrow.from);
    if (inner === undefined) {
      inner = new Map();
      byFrom.set(arrow.from, inner);
    }
    let candidates = inner.get(arrow.to);
    if (candidates === undefined) {
      candidates = [];
      inner.set(arrow.to, candidates);
      pairs.push({ from: arrow.from, to: arrow.to, candidates, unranked: true });
    }
    candidates.push(arrow.candidate);
  }
  return pairs;
}

/** The order in which pairs are admitted: largest total first, then from, then to. */
export const byAdmission: (a: Pair, b: Pair) => number = comparePairs;

/** The order in which the spare edge budget is given out: smallest total first, then from, then to. */
const bySmallest = (a: Pair, b: Pair): number =>
  a.candidates.length - b.candidates.length || compareStrings(a.from, b.from) || compareStrings(a.to, b.to);

const rankedCandidates = (pair: Pair): readonly NavigatorCandidate[] => (pair.unranked === true ? [...pair.candidates].sort(compareRank) : pair.candidates);

/** The best-ranked candidate of a pair (a linear scan unless the pair is already ranked). */
function bestOf(pair: Pair): NavigatorCandidate {
  let best = pair.candidates[0] as NavigatorCandidate;
  if (pair.unranked !== true) return best;
  for (const candidate of pair.candidates) if (compareRank(candidate, best) < 0) best = candidate;
  return best;
}

/**
 * Chooses the candidates to draw for the admitted pairs under `edgeBudget` (at least `admitted.length`).
 * Pass 1: every pair materialises its best-ranked candidate. Pass 2: the rest of the budget goes to pairs in
 * (total ascending, from, to) order, each taking up to min(total, DEFAULT_DEGREE_CAP) candidates in rank order.
 * Small pairs are therefore complete, and a small dataset keeps every edge. Never more than `edgeBudget` in all.
 */
export function materialise(admitted: readonly Pair[], edgeBudget: number): Map<Pair, readonly NavigatorCandidate[]> {
  const drawn = new Map<Pair, readonly NavigatorCandidate[]>();
  for (const pair of admitted) drawn.set(pair, [bestOf(pair)]);
  let spare = edgeBudget - admitted.length;
  if (spare <= 0) return drawn;
  for (const pair of [...admitted].sort(bySmallest)) {
    const extra = Math.min(pair.candidates.length, DEFAULT_DEGREE_CAP) - 1;
    if (extra <= 0) continue;
    const take = Math.min(extra, spare);
    drawn.set(pair, rankedCandidates(pair).slice(0, take + 1));
    spare -= take;
    if (spare <= 0) break;
  }
  return drawn;
}
