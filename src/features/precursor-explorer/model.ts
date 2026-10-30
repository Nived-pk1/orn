/**
 * The Precursors view's bookkeeping (step 7.2a D3-D6): the engine query from the choices, the words of a found route and of a stored one,
 * and dropping saved choices that name nothing any more. Pure; the chemistry is the core's (route search, the card). Nothing here is stored.
 */
import {
  arrowWordsOf,
  createDescriber,
  DEFAULT_ROUTE_MAX_ROUTES,
  DEFAULT_TRAVERSAL_LIMITS,
  reactionCard,
  routeSizeWords,
  stepWarningWords,
  type ArrowTextPart,
  type FoundRoute,
  type ProjectionContext,
  type RouteQuery,
} from '@/core/graph';
import { primarySubstrateOf } from '@/core/indexes/navigator-rollup';
import type { CanonicalState, Reaction, RecordRef, Route } from '@/core/schema';
import type { PrecursorsState, SubstanceChoice } from '@/ui/state';

export type Choices = Pick<PrecursorsState, 'target' | 'startFrom' | 'maxSteps' | 'onlyListed' | 'onlyInScope'>;

/** The ask for the engine. The engine's own limits stay in force; "only the listed" needs a start-from, "only <exam>" excludes outside reactions. */
export function queryOf(choices: Choices & { readonly target: SubstanceChoice }, outsideIds: readonly string[]): RouteQuery {
  const listed = choices.onlyListed && choices.startFrom.length > 0;
  return {
    target: choices.target as RouteQuery['target'],
    maxSteps: choices.maxSteps,
    maxRoutes: DEFAULT_ROUTE_MAX_ROUTES,
    ...(choices.startFrom.length === 0 ? {} : { startFrom: choices.startFrom as RouteQuery['startFrom'] }),
    assumption: listed ? 'only_listed_inputs' : 'side_inputs_available',
    ...(choices.onlyInScope && outsideIds.length > 0 ? { excludeReactionIds: outsideIds as RouteQuery['excludeReactionIds'] } : {}),
    limits: DEFAULT_TRAVERSAL_LIMITS,
  };
}

/** The reactions the chosen exam scope calls outside, in ID order; none when no exam is chosen. */
export function outsideReactionIds(state: CanonicalState, scopeOf: ProjectionContext['scopeOf'] | undefined): string[] {
  if (scopeOf === undefined) return [];
  return Object.keys(state.records.reaction)
    .filter((id) => scopeOf({ kind: 'reaction', id }) === 'outside')
    .sort();
}

/** The saved choices without the records that are gone; `dropped` says whether any went (the view tells the user once). */
export function pruneChoices<T extends Pick<Choices, 'target' | 'startFrom'>>(choices: T, state: CanonicalState): { readonly dropped: boolean; readonly choices: T } {
  const exists = (one: SubstanceChoice): boolean => (state.records[one.kind] as Readonly<Record<string, unknown>>)[one.id] !== undefined;
  const target = choices.target !== null && exists(choices.target) ? choices.target : null;
  const startFrom = choices.startFrom.filter(exists);
  const dropped = target !== choices.target || startFrom.length !== choices.startFrom.length;
  return dropped ? { dropped, choices: { ...choices, target, startFrom } } : { dropped, choices };
}

export interface StepView {
  readonly n: number;
  readonly reactionId: string;
  readonly reactionName: string;
  /** The outcome the step uses; empty when it names none. */
  readonly outcomeId: string;
  readonly from: string;
  readonly to: string;
  /** The text on the arrow ("PCC, CH2Cl2"); empty when there is none. */
  readonly arrow: string;
  /** The same text as parts, drawn with the card's formula typography (H₃O⁺). */
  readonly arrowAbove: readonly ArrowTextPart[];
  readonly arrowBelow: readonly ArrowTextPart[];
  /** Plain words, never the engine's text. */
  readonly warnings: readonly string[];
}

export interface RouteView {
  readonly key: string;
  /** A stored route's name; absent for a found one. */
  readonly name?: string;
  readonly heading: string;
  readonly steps: readonly StepView[];
  /** A found route: what "Save as route" hands over (the engine's own steps). */
  readonly found?: readonly { readonly reactionId: string; readonly outcomeId: string; readonly conditionVariantIds: readonly string[] }[];
}

/** The saved route whose steps are the same reactions in the same order (and the same outcome where the saved step names one); undefined when none. */
export function savedMatchOf(route: RouteView, saved: readonly RouteView[]): RouteView | undefined {
  return saved.find((one) => one.steps.length === route.steps.length && one.steps.every((step, i) => step.reactionId === route.steps[i]?.reactionId && (step.outcomeId === '' || step.outcomeId === route.steps[i]?.outcomeId)));
}

function arrowPartsOf(ctx: ProjectionContext, reactionId: string, outcomeId: string | undefined): { readonly above: readonly ArrowTextPart[]; readonly below: readonly ArrowTextPart[] } {
  const card = reactionCard(ctx, reactionId);
  if ('missing' in card) return { above: [], below: [] };
  const group = card.groups.find((one) => one.outcomes.some((outcome) => outcome.outcomeId === outcomeId)) ?? card.groups[0];
  return group === undefined ? { above: [], below: [] } : group.arrowText;
}


function stepOf(ctx: ProjectionContext, n: number, step: { readonly reactionId: string; readonly outcomeId?: string | undefined; readonly from: string; readonly to: string; readonly warnings?: readonly string[] }): StepView {
  const reaction = ctx.state.records.reaction[step.reactionId as never] as Reaction | undefined;
  const parts = arrowPartsOf(ctx, step.reactionId, step.outcomeId);
  return {
    n,
    reactionId: step.reactionId,
    reactionName: reaction?.name ?? step.reactionId,
    outcomeId: step.outcomeId ?? '',
    from: step.from,
    to: step.to,
    arrow: arrowWordsOf(parts),
    arrowAbove: parts.above,
    arrowBelow: parts.below,
    warnings: (step.warnings ?? []).map(stepWarningWords),
  };
}

/** A found route in words: "3 steps from Ethanol" and its numbered steps, in the order the engine gave (the first step starts the route). */
export function routeViewOf(route: FoundRoute, ctx: ProjectionContext): RouteView {
  const describer = createDescriber(ctx.state);
  const nameOf = (ref: RecordRef): string => describer.describe(ref)?.name ?? ref.id;
  const first = route.steps[0];
  return {
    key: route.key,
    found: route.steps.map((step) => ({ reactionId: step.reactionId, outcomeId: step.outcomeId, conditionVariantIds: [...step.conditionVariantIds] })),
    heading: routeSizeWords(route.steps.length, first === undefined ? undefined : nameOf(first.carriedIn)),
    steps: route.steps.map((step, index) => stepOf(ctx, index + 1, { reactionId: step.reactionId, outcomeId: step.outcomeId, from: nameOf(step.carriedIn), to: nameOf(step.carriedOut), warnings: step.warnings })),
  };
}

/** Stored steps in the order their inputs allow (a step after the steps it takes input from); the record's order breaks ties and cycles. */
function orderedSteps(route: Route): Route['steps'] {
  const placed = new Set<string>();
  const out: Route['steps'][number][] = [];
  let rest = [...route.steps];
  while (rest.length > 0) {
    const ready = rest.filter((step) => step.inputFromStepIds.every((id) => placed.has(id) || !rest.some((other) => other.id === id)));
    const take = ready.length > 0 ? ready : rest;
    const next = take[0] as Route['steps'][number];
    out.push(next);
    placed.add(next.id);
    rest = rest.filter((step) => step !== next);
  }
  return out;
}

/** The stored routes that end at the target, name first and read-only, in folded-name then ID order. */
export function savedRoutesFor(target: SubstanceChoice, ctx: ProjectionContext): RouteView[] {
  const describer = createDescriber(ctx.state);
  const routes = (Object.values(ctx.state.records.route) as Route[]).filter((route) => route.target?.kind === target.kind && route.target.id === target.id);
  return routes
    .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : a.id < b.id ? -1 : 1))
    .map((route) => ({
      key: route.id,
      name: route.name,
      heading: routeSizeWords(route.steps.length, undefined),
      steps: orderedSteps(route).map((step, index) => {
        const reaction = ctx.state.records.reaction[step.reactionId] as Reaction | undefined;
        const outcome = reaction?.outcomes.find((one) => one.id === step.outcomeId) ?? reaction?.outcomes[0];
        const substrate = reaction === undefined ? undefined : primarySubstrateOf(ctx.indexes, reaction);
        const product = outcome?.products.find((one) => one.role === 'main') ?? outcome?.products[0];
        const nameOf = (ref: RecordRef | undefined): string => (ref === undefined ? '' : (describer.describe(ref)?.name ?? ref.id));
        return stepOf(ctx, index + 1, { reactionId: step.reactionId, outcomeId: step.outcomeId, from: nameOf(substrate?.ref), to: nameOf(product?.ref) });
      }),
    }));
}
