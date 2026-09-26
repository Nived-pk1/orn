/**
 * L3 route rules RTE-001…RTE-004. A route's step graph is its own content; whether one step feeds the
 * next depends on reactions, species and the class hierarchy, so RTE-002 and RTE-004 watch those kinds
 * and name the routes affected by a change to any of them (walking referrers, bounded).
 */
import type { AnyRecord, RecordKind, RecordRef, Route } from '../../schema';
import type { RuleContext, ValidationRule } from '../contracts';
import { MAX_WALK_NODES, allOfKinds, asRef, at, lifecycleSeverity, rule } from './helpers';
import { productsOf, reactants } from './reaction-utils';

/** Kinds through which a change can reach a route: routes use reactions, reactions use species and classes. */
const REACHING: ReadonlySet<RecordKind> = new Set<RecordKind>(['route', 'reaction', 'species', 'class']);

function routesAffectedBy(record: AnyRecord, ctx: RuleContext): RecordRef[] {
  const routes = new Map<string, RecordRef>();
  const seen = new Set<string>([record.id]);
  const queue: string[] = [record.id];
  for (let head = 0; head < queue.length; head += 1) {
    if (seen.size > MAX_WALK_NODES) return allOfKinds(ctx, ['route']);
    for (const ref of ctx.indexes.referrersOf(queue[head] as string)) {
      if (!REACHING.has(ref.owner.kind)) continue;
      if (ref.owner.kind === 'route') routes.set(ref.owner.id, ref.owner);
      if (seen.has(ref.owner.id) || ref.owner.kind === 'route') continue;
      seen.add(ref.owner.id);
      queue.push(ref.owner.id);
    }
  }
  return [...routes.values()];
}

/** Does something produced (a species or class) count as the wanted thing, exactly or by class? */
function satisfies(produced: RecordRef, wanted: RecordRef, ctx: RuleContext): boolean {
  if (produced.id === wanted.id) return true;
  if (wanted.kind !== 'class') return false;
  if (produced.kind === 'class') return ctx.indexes.ancestorsOf('class', produced.id).includes(wanted.id);
  const species = ctx.indexes.get(produced.id);
  if (species?.kind !== 'species') return false;
  return species.classIds.some((c) => c === wanted.id || ctx.indexes.ancestorsOf('class', c).includes(wanted.id));
}

function stepProducts(step: Route['steps'][number], ctx: RuleContext): RecordRef[] | undefined {
  const reaction = ctx.indexes.get(step.reactionId);
  return reaction?.kind === 'reaction' ? productsOf(reaction, step.outcomeId) : undefined;
}

export const ROUTE_RULES: readonly ValidationRule[] = [
  rule({
    id: 'RTE-001',
    level: 3,
    kinds: ['route'],
    defaultSeverity: 'error',
    scope: 'record',
    description: 'Route step graph has a cycle or references itself',
    *check(route) {
      const inputs = new Map<string, readonly string[]>(route.steps.map((s) => [s.id, s.inputFromStepIds]));
      for (const [i, step] of route.steps.entries()) {
        if (step.inputFromStepIds.includes(step.id)) {
          yield { path: at('steps', i, 'inputFromStepIds'), message: `Step ${i + 1} takes its input from itself.` };
          continue;
        }
        const seen = new Set<string>();
        const queue: string[] = [...step.inputFromStepIds];
        for (let head = 0; head < queue.length; head += 1) {
          const id = queue[head] as string;
          if (seen.has(id)) continue;
          seen.add(id);
          queue.push(...(inputs.get(id) ?? []));
        }
        if (!seen.has(step.id)) continue;
        yield { path: at('steps', i, 'inputFromStepIds'), message: `Step ${i + 1} is part of a cycle: it depends, through other steps, on itself.` };
      }
    },
  }),

  rule({
    id: 'RTE-002',
    level: 3,
    kinds: ['route'],
    watches: ['reaction', 'species', 'class'],
    defaultSeverity: 'warning',
    scope: 'neighbourhood',
    description: "A step's input does not match any product of the step it claims to use",
    peers: (record, ctx) => routesAffectedBy(record, ctx),
    *check(route, ctx) {
      const byId = new Map(route.steps.map((s) => [s.id, s] as const));
      for (const [i, step] of route.steps.entries()) {
        const reaction = ctx.indexes.get(step.reactionId);
        if (reaction?.kind !== 'reaction') continue;
        const wanted = reactants(reaction).filter((ref) => ref.kind !== 'reagent');
        for (const [k, inputId] of step.inputFromStepIds.entries()) {
          const source = byId.get(inputId);
          const made = source === undefined ? undefined : stepProducts(source, ctx);
          if (made === undefined) continue;
          if (made.some((product) => wanted.some((want) => satisfies(product, want, ctx)))) continue;
          yield {
            path: at('steps', i, 'inputFromStepIds', k),
            message: `Step ${i + 1} takes input from a step whose products do not include any of its reactants, even by class.`,
            related: [asRef(reaction)],
          };
        }
      }
    },
  }),

  rule({
    id: 'RTE-003',
    level: 3,
    kinds: ['route'],
    defaultSeverity: 'warning',
    scope: 'record',
    description: 'Route with no steps (draft WARNING / published ERROR)',
    *check(route) {
      if (route.steps.length > 0) return;
      yield { path: 'steps', severity: lifecycleSeverity(route), message: `"${route.name}" has no steps.` };
    },
  }),

  rule({
    id: 'RTE-004',
    level: 3,
    kinds: ['route'],
    watches: ['reaction', 'species', 'class'],
    defaultSeverity: 'warning',
    scope: 'neighbourhood',
    description: 'Route target is not produced by a final step',
    peers: (record, ctx) => routesAffectedBy(record, ctx),
    *check(route, ctx) {
      if (route.target === undefined || route.steps.length === 0) return;
      const feeding = new Set(route.steps.flatMap((s) => s.inputFromStepIds));
      const finals = route.steps.filter((s) => !feeding.has(s.id));
      const made = finals.map((s) => stepProducts(s, ctx));
      if (made.some((products) => products === undefined)) return; // a reaction is missing: REF-001
      const target: RecordRef = { kind: route.target.kind, id: route.target.id };
      if (made.some((products) => products?.some((p) => satisfies(p, target, ctx)) === true)) return;
      yield { path: 'target', message: 'No final step of this route produces its target, even by class.', related: [target] };
    },
  }),
];
