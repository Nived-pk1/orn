/**
 * The navigator's per-pair table (step 5.4c; docs/GRAPH_SEMANTICS.md §8, §11): every ordered (fromHub, toHub)
 * pair with all of its arrow candidates, each list ranked for drawing (selectivity, then reaction, outcome,
 * product ID). Maintained incrementally with the rest of the roll-up (retract-then-add per touched reaction),
 * so an unfiltered overview reads pair sizes and best arrows without scanning candidates. Derived, never stored.
 */
import type { Outcome, Participant, Product, ReactionId, RecordRef } from '../schema';
import { compareStrings, Table } from './table';

/** One precomputed navigator arrow candidate: a reaction's carried substrate to one main product. */
export interface NavigatorCandidate {
  readonly fromHub: string;
  readonly toHub: string;
  /** True when either end was reached through class membership rather than a stated anchor. */
  readonly inferred: boolean;
  readonly reactionId: ReactionId;
  readonly outcomeId: Outcome['id'];
  readonly productId: Product['id'];
  readonly participantId: Participant['id'];
  readonly selectivity: Outcome['selectivity'];
  readonly conditionVariantIds: Outcome['conditionVariantIds'];
  /** The carried substrate and the main product themselves (step 5.4c: hub expansion reads them without a lookup). */
  readonly substrate: RecordRef;
  readonly product: RecordRef;
}

/** One ordered hub pair and all of its candidates, best-ranked first. */
export interface NavigatorPair {
  readonly from: string;
  readonly to: string;
  readonly candidates: readonly NavigatorCandidate[];
}

/** Strongest first. Selectivity is the only data key: exam scope and names are not read here (step 5.4c). */
const SELECTIVITY_RANK: Readonly<Record<string, number>> = {
  exclusive: 0,
  major: 1,
  mixture_component: 2,
  unspecified: 3,
  minor: 4,
  trace: 5,
};

/** The order of arrows inside a pair: selectivity, then reaction, outcome and product ID. */
export function compareRank(a: NavigatorCandidate, b: NavigatorCandidate): number {
  const byRank = (SELECTIVITY_RANK[a.selectivity] ?? 6) - (SELECTIVITY_RANK[b.selectivity] ?? 6);
  if (byRank !== 0) return byRank;
  return compareStrings(a.reactionId, b.reactionId) || compareStrings(a.outcomeId, b.outcomeId) || compareStrings(a.productId, b.productId);
}

/** The order in which pairs are admitted: largest total first, then from, then to. */
export const comparePairs = (a: NavigatorPair, b: NavigatorPair): number =>
  b.candidates.length - a.candidates.length || compareStrings(a.from, b.from) || compareStrings(a.to, b.to);

export class PairTable {
  private readonly table = new Table<NavigatorCandidate>(compareRank);
  private published: readonly NavigatorPair[] | undefined;

  add(candidate: NavigatorCandidate): void {
    this.table.add(candidate.reactionId, `${candidate.fromHub}\u0000${candidate.toHub}`, candidate);
  }

  removeOwner(reactionId: string): void {
    this.table.removeOwner(reactionId);
  }

  commit(): void {
    this.table.commit();
    this.published = undefined;
  }

  /** Every pair, ordered by (total descending, from, to); built once per commit and shared until the next one. */
  pairs(): readonly NavigatorPair[] {
    if (this.published === undefined) {
      const pairs: NavigatorPair[] = [];
      for (const key of this.table.keys()) {
        const candidates = this.table.get(key);
        const first = candidates[0];
        if (first !== undefined) pairs.push({ from: first.fromHub, to: first.toHub, candidates });
      }
      this.published = pairs.sort(comparePairs);
    }
    return this.published;
  }
}
