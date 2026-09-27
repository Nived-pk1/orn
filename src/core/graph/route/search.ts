/**
 * Route search (docs/GRAPH_SEMANTICS.md §9, INV-22, P-09): bounded best-first search over
 * `(substance, steps used)` states. Implemented as a backward, per-path-cycle-safe walk from the target —
 * every substance reached is a legitimate route ending there ("any source is acceptable" when `startFrom`
 * is not given); when `startFrom` is given, only a path that reaches one of those substances (exactly, or
 * by class membership either way) completes a route. Bounded by `maxSteps` (clamped to `limits.maxDepth`),
 * `limits.maxNodes` / `maxEdges` as an explored-state budget, `limits.timeBudgetMs` and `limits.signal`.
 * Nothing is cut silently: a clamp or a budget that actually stopped exploration is reported as truncation.
 */
import type { ClassId, RecordRef, SubstanceRef } from '../../schema';
import type { ProjectionContext, RouteQuery, RouteSearchResult, Truncation } from '../contracts';
import { backwardMovesInto, CLASS_LEVEL_MATCH_WARNING } from './moves';
import { draftStep, rankRoutes, type RouteStepDraft } from './rank';

/** Injected clock, kept out of the (serialisable) `RouteQuery` — same pattern as `traverse`'s `now`. */
export interface SearchRoutesOptions {
  readonly now?: () => number;
}

const refKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

/** Whether `ref` completes a route given `startFrom` ("any source" when undefined), and whether that hop was inferred by class membership (either direction). */
function completes(ctx: ProjectionContext, ref: RecordRef, startFrom: readonly SubstanceRef[] | undefined): { readonly ok: boolean; readonly inferred: boolean } {
  if (startFrom === undefined) return { ok: true, inferred: false };
  for (const start of startFrom) if (start.kind === ref.kind && start.id === ref.id) return { ok: true, inferred: false };
  for (const start of startFrom) {
    if (start.kind === 'class' && ref.kind === 'species' && ctx.indexes.speciesInClass(start.id, { transitive: true }).some((m) => m.id === ref.id)) {
      return { ok: true, inferred: true };
    }
    if (start.kind === 'species' && ref.kind === 'class' && ctx.indexes.speciesInClass(ref.id as ClassId, { transitive: true }).some((m) => m.id === start.id)) {
      return { ok: true, inferred: true };
    }
  }
  return { ok: false, inferred: false };
}

/** Under `only_listed_inputs`, every side input must be a listed starting material or already produced earlier in the (chronological) route; the route's own first substance is always available. */
function onlyListedInputsHold(steps: readonly RouteStepDraft[], startFrom: readonly SubstanceRef[] | undefined): boolean {
  const available = new Set<string>((startFrom ?? []).map(refKey));
  const first = steps[0];
  if (first !== undefined) available.add(refKey(first.carriedIn));
  for (const step of steps) {
    for (const input of step.sideInputs) if (!available.has(refKey(input))) return false;
    available.add(refKey(step.carriedOut));
  }
  return true;
}

interface Budget {
  nodesExplored: number;
  edgesExplored: number;
  reason: Truncation['reason'] | null;
  hiddenEstimate: number;
}

export function searchRoutes(ctx: ProjectionContext, query: RouteQuery, options: SearchRoutesOptions = {}): RouteSearchResult {
  const targetRef: RecordRef = { kind: query.target.kind, id: query.target.id };
  const excludeReactionIds = new Set(query.excludeReactionIds ?? []);
  const effectiveMaxSteps = Math.max(0, Math.min(query.maxSteps, query.limits.maxDepth));
  const depthClamped = query.maxSteps > effectiveMaxSteps;

  const budget: Budget = { nodesExplored: 0, edgesExplored: 0, reason: null, hiddenEstimate: 0 };
  const startedAt = options.now?.();
  const stop = (reason: Truncation['reason']): void => {
    budget.reason ??= reason;
  };
  const outOfBudget = (): boolean => {
    if (budget.reason !== null) return true;
    if (query.limits.signal?.aborted) return (stop('aborted'), true);
    if (budget.nodesExplored >= query.limits.maxNodes) return (stop('max_nodes'), true);
    if (budget.edgesExplored >= query.limits.maxEdges) return (stop('max_edges'), true);
    if (options.now !== undefined && startedAt !== undefined && options.now() - startedAt > query.limits.timeBudgetMs) return (stop('time_budget'), true);
    return false;
  };

  const found: RouteStepDraft[][] = [];
  let depthCutoffHit = false;

  const explore = (currentRef: RecordRef, backward: readonly RouteStepDraft[], visited: ReadonlySet<string>): void => {
    if (outOfBudget()) return;
    budget.nodesExplored += 1;

    if (backward.length > 0) {
      const done = completes(ctx, currentRef, query.startFrom);
      if (done.ok) {
        const chronological = [...backward].reverse();
        found.push(done.inferred ? withExtraWarning(chronological, CLASS_LEVEL_MATCH_WARNING) : chronological);
      }
    }

    const moves = backwardMovesInto(ctx, currentRef, excludeReactionIds);
    if (backward.length >= effectiveMaxSteps) {
      if (moves.length > 0) depthCutoffHit = true;
      return;
    }

    for (const move of moves) {
      if (outOfBudget()) return;
      budget.edgesExplored += 1;
      const key = refKey(move.carriedIn);
      // A side input assumed "available" must not be a substance the route already carries elsewhere
      // (including the target itself): that would make the route depend on having already made its own
      // output, which is circular, not a free input (e.g. Fischer esterification back to its own acid).
      if (visited.has(key) || move.sideInputs.some((input) => visited.has(refKey(input)))) {
        budget.hiddenEstimate += 1;
        continue;
      }
      explore(move.carriedIn, [...backward, draftStep(move)], new Set([...visited, key]));
    }
  };

  explore(targetRef, [], new Set([refKey(targetRef)]));
  if (budget.reason === null && depthClamped && depthCutoffHit) stop('max_depth');

  const valid = query.assumption === 'only_listed_inputs' ? found.filter((steps) => onlyListedInputsHold(steps, query.startFrom)) : found;

  return {
    routes: rankRoutes(valid, query.maxRoutes),
    explored: budget.nodesExplored,
    truncation: budget.reason === null ? null : { reason: budget.reason, hiddenNodeEstimate: budget.hiddenEstimate },
  };
}

function withExtraWarning(steps: readonly RouteStepDraft[], warning: string): RouteStepDraft[] {
  const [first, ...rest] = steps;
  if (first === undefined) return [...steps];
  return [{ ...first, warnings: [...first.warnings, warning] }, ...rest];
}
