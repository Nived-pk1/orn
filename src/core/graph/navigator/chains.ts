/**
 * "From A to B" (step 8.2b, C1): the chains of families that lead from one family to another through family-to-family reactions. A breadth-first
 * search on the family graph, bounded in steps, in chains returned and in paths visited. Within-family reactions and the Unclassified box are
 * never steps; a family appears at most once in a chain. Pure and deterministic; derived, never stored.
 */
import { compareStrings } from '../../indexes/table';

export const CHAIN_MAX_STEPS = 3;
export const CHAIN_MAX_CHAINS = 5;
/** The most paths the search visits; past it the answer says it may be incomplete. */
export const CHAIN_PATH_BUDGET = 1000;

export interface FamilyEdge {
  readonly from: string;
  readonly to: string;
  /** The distinct reactions of the pair, sorted. */
  readonly reactionIds: readonly string[];
}

export interface FamilyChain {
  readonly families: readonly string[];
  readonly steps: readonly FamilyEdge[];
}

export type ChainResult = { readonly ok: true; readonly chains: readonly FamilyChain[]; readonly truncated: boolean } | { readonly ok: false; readonly reason: string };

interface PairLike {
  readonly from: string;
  readonly to: string;
  readonly candidates: readonly { readonly reactionId: string }[];
}

/** The family edges of the roll-up's pairs: no within-family pair, nothing touching `exclude` (the Unclassified hub), no empty pair. */
export function familyEdgesOf(pairs: readonly PairLike[], exclude: ReadonlySet<string>): FamilyEdge[] {
  const out: FamilyEdge[] = [];
  for (const pair of pairs) {
    if (pair.from === pair.to || exclude.has(pair.from) || exclude.has(pair.to)) continue;
    const ids = [...new Set(pair.candidates.map((c) => c.reactionId))].sort(compareStrings);
    if (ids.length > 0) out.push({ from: pair.from, to: pair.to, reactionIds: ids });
  }
  return out;
}

export function familyChains(
  edges: readonly FamilyEdge[],
  from: string,
  to: string,
  options: { readonly maxSteps?: number; readonly maxChains?: number; readonly nameOf?: (id: string) => string } = {},
): ChainResult {
  if (from === to) return { ok: false, reason: 'Choose two different families.' };
  const maxSteps = options.maxSteps ?? CHAIN_MAX_STEPS;
  const maxChains = options.maxChains ?? CHAIN_MAX_CHAINS;
  const nameOf = options.nameOf ?? ((id: string) => id);
  const out = new Map<string, FamilyEdge[]>();
  for (const edge of edges) out.set(edge.from, [...(out.get(edge.from) ?? []), edge]);
  for (const list of out.values()) list.sort((a, b) => compareStrings(a.to, b.to));
  const found: FamilyChain[] = [];
  let visited = 0;
  let truncated = false;
  let layer: FamilyEdge[][] = [[]];
  search: for (let depth = 1; depth <= maxSteps && layer.length > 0; depth += 1) {
    const next: FamilyEdge[][] = [];
    for (const path of layer) {
      const last = path.length === 0 ? from : (path[path.length - 1] as FamilyEdge).to;
      for (const edge of out.get(last) ?? []) {
        if (edge.to === from || path.some((step) => step.from === edge.to)) continue;
        visited += 1;
        if (visited > CHAIN_PATH_BUDGET) {
          truncated = true;
          break search;
        }
        const steps = [...path, edge];
        if (edge.to === to) found.push({ families: [from, ...steps.map((s) => s.to)], steps });
        else next.push(steps);
      }
    }
    layer = next;
  }
  const weakest = (chain: FamilyChain): number => Math.min(...chain.steps.map((s) => s.reactionIds.length));
  found.sort((a, b) => {
    if (a.steps.length !== b.steps.length) return a.steps.length - b.steps.length;
    if (weakest(a) !== weakest(b)) return weakest(b) - weakest(a);
    for (let i = 0; i < a.families.length; i += 1) {
      const order = compareStrings(nameOf(a.families[i] as string), nameOf(b.families[i] as string));
      if (order !== 0) return order;
    }
    return 0;
  });
  return { ok: true, chains: found.slice(0, maxChains), truncated };
}
