/**
 * Ranking and deduplication for route search (docs/GRAPH_SEMANTICS.md §9): fewer steps first; then
 * major/exclusive outcomes over minor; then stated moves over inferred (class-level matches); then a
 * published reaction over a draft; ties broken by the reaction-ID sequence. `FoundRoute.score` is an
 * informational summary only — the returned array order is the authoritative ranking (deterministic, P-09).
 */
import { hashParts } from '../../hash';
import type { Outcome, Review } from '../../schema';
import type { FoundRoute, FoundRouteStep } from '../contracts';
import type { CarriedMove } from './moves';

/** A step plus the two reaction-level facts ranking needs, dropped again before the step is returned. */
export interface RouteStepDraft extends FoundRouteStep {
  readonly selectivity: Outcome['selectivity'];
  readonly lifecycle: Review['lifecycle'];
}

export const draftStep = (move: CarriedMove): RouteStepDraft => ({
  reactionId: move.reaction.id,
  outcomeId: move.outcome.id,
  conditionVariantIds: move.conditionVariantIds,
  carriedIn: move.carriedIn,
  carriedOut: move.carriedOut,
  sideInputs: move.sideInputs,
  warnings: move.warnings,
  selectivity: move.outcome.selectivity,
  lifecycle: move.reaction.review.lifecycle,
});

const SELECTIVITY_RANK: Readonly<Record<Outcome['selectivity'], number>> = {
  exclusive: 0,
  major: 0,
  minor: 1,
  trace: 2,
  mixture_component: 2,
  unspecified: 2,
};

function routeKey(steps: readonly FoundRouteStep[]): string {
  const parts = steps.flatMap((s) => [s.reactionId, s.outcomeId, s.carriedIn.id, s.carriedOut.id, s.conditionVariantIds.join(',')]);
  return `rte_${hashParts(parts)}`;
}

const worstSelectivity = (steps: readonly RouteStepDraft[]): number => steps.reduce((worst, s) => Math.max(worst, SELECTIVITY_RANK[s.selectivity]), 0);
const inferredCount = (steps: readonly FoundRouteStep[]): number => steps.filter((s) => s.warnings.length > 0).length;
const draftReactionCount = (steps: readonly RouteStepDraft[]): number => steps.filter((s) => s.lifecycle === 'draft').length;

function compareRoutes(a: readonly RouteStepDraft[], b: readonly RouteStepDraft[]): number {
  if (a.length !== b.length) return a.length - b.length;
  const bySelectivity = worstSelectivity(a) - worstSelectivity(b);
  if (bySelectivity !== 0) return bySelectivity;
  const byInferred = inferredCount(a) - inferredCount(b);
  if (byInferred !== 0) return byInferred;
  const byLifecycle = draftReactionCount(a) - draftReactionCount(b);
  if (byLifecycle !== 0) return byLifecycle;
  for (let i = 0; i < a.length; i += 1) {
    const [ra, rb] = [a[i]?.reactionId, b[i]?.reactionId];
    if (ra !== rb) return (ra ?? '') < (rb ?? '') ? -1 : 1;
  }
  return 0;
}

const toPublicStep = (s: RouteStepDraft): FoundRouteStep => ({
  reactionId: s.reactionId,
  outcomeId: s.outcomeId,
  conditionVariantIds: s.conditionVariantIds,
  carriedIn: s.carriedIn,
  carriedOut: s.carriedOut,
  sideInputs: s.sideInputs,
  warnings: s.warnings,
});

/** Deduplicates candidate routes by their step-sequence key, sorts by the ranking rule, trims to `maxRoutes`. */
export function rankRoutes(candidates: readonly (readonly RouteStepDraft[])[], maxRoutes: number): FoundRoute[] {
  const byKey = new Map<string, readonly RouteStepDraft[]>();
  for (const steps of candidates) byKey.set(routeKey(steps), steps);
  const sorted = [...byKey.entries()].sort(([, a], [, b]) => compareRoutes(a, b));
  return sorted.slice(0, Math.max(0, maxRoutes)).map(([key, steps]) => ({
    key,
    steps: steps.map(toPublicStep),
    score: steps.length * 1000 + worstSelectivity(steps) * 100 + inferredCount(steps) * 10 + draftReactionCount(steps),
  }));
}
