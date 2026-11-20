/**
 * Backward moves for route search (docs/GRAPH_SEMANTICS.md §9). Given a substance already reached while
 * walking backward from the target, find every reaction that could have produced it as a *main* product,
 * and every reactant that could carry the route one step further back: the exact participant, or — when
 * the participant's own ref is a class — every concrete species inferred to satisfy it by class
 * membership. An inferred move is never presented as a stated fact: it carries `CLASS_LEVEL_MATCH_WARNING`.
 */
import type { ClassId, ConditionVariantId, Outcome, Participant, Reaction, RecordRef } from '../../schema';
import type { ProjectionContext } from '../contracts';
import { drawnAsNode } from '../kit';
import { variantsOfParticipant } from '../reaction-explorer/select';

export const CLASS_LEVEL_MATCH_WARNING = 'class-level match, verify substrate scope';

export interface CarriedMove {
  readonly reaction: Reaction;
  readonly outcome: Outcome;
  readonly carriedIn: RecordRef;
  readonly carriedOut: RecordRef;
  /** Other qualifying participants of `reaction`, assumed available (side inputs), sorted for determinism. */
  readonly sideInputs: readonly RecordRef[];
  /** Empty = holds under every condition variant of `reaction`. */
  readonly conditionVariantIds: readonly ConditionVariantId[];
  readonly inferred: boolean;
  readonly warnings: readonly string[];
}

const refKey = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;
const byRefKey = (a: RecordRef, b: RecordRef): number => (refKey(a) < refKey(b) ? -1 : refKey(a) > refKey(b) ? 1 : 0);

/** Qualifying (non-spectator, drawn-as-node) participants other than `keep`, deduplicated and sorted. */
function sideInputsExcluding(ctx: ProjectionContext, reaction: Reaction, keep: Participant['id']): RecordRef[] {
  const seen = new Map<string, RecordRef>();
  for (const p of reaction.participants) {
    if (p.id === keep || p.role === 'spectator' || !drawnAsNode(ctx, p.ref)) continue;
    const ref: RecordRef = { kind: p.ref.kind, id: p.ref.id };
    seen.set(refKey(ref), ref);
  }
  return [...seen.values()].sort(byRefKey);
}

/**
 * Variants under which both `participant` and `outcome` hold, combining each side's own restriction
 * (empty = common to every variant, per DOMAIN_MODEL.md §6.4). `null` means the two restrictions never
 * overlap: a dead combination that no condition variant satisfies.
 */
export function sharedVariants(reaction: Reaction, participant: Participant, outcome: Outcome): readonly ConditionVariantId[] | null {
  const forParticipant = variantsOfParticipant(reaction, participant.id);
  const forOutcome = outcome.conditionVariantIds;
  if (forParticipant.length === 0) return forOutcome;
  if (forOutcome.length === 0) return forParticipant;
  const outcomeSet = new Set(forOutcome);
  const shared = forParticipant.filter((v) => outcomeSet.has(v));
  return shared.length === 0 ? null : shared;
}

/** Warning on a move made through a reaction that makes a BROADER class than the walked class (step C3). */
export const BROADER_CLASS_WARNING = 'made as the broader class, verify scope';

interface ProducedAs {
  readonly ref: RecordRef;
  readonly inferred: boolean;
  readonly warning: string | null;
}

/**
 * What the walked substance can be produced AS: itself (stated), then every class it belongs to or is
 * under (inferred, transitive: the class depth cap lives in `classAncestors`). A species walks up to its
 * classes ("class-level match"); a class walks up to its ancestor classes ("made as the broader class").
 */
function producedAs(ctx: ProjectionContext, target: RecordRef): ProducedAs[] {
  const out: ProducedAs[] = [{ ref: target, inferred: false, warning: null }];
  const seen = new Set<string>([refKey(target)]);
  const add = (id: string, warning: string): void => {
    const ref: RecordRef = { kind: 'class', id };
    if (seen.has(refKey(ref))) return;
    seen.add(refKey(ref));
    out.push({ ref, inferred: true, warning });
  };
  if (target.kind === 'species') {
    const record = ctx.indexes.get(target.id);
    if (record?.kind !== 'species') return out;
    for (const classId of record.classIds) {
      add(classId, CLASS_LEVEL_MATCH_WARNING);
      for (const ancestor of ctx.indexes.classAncestors(classId)) add(ancestor, CLASS_LEVEL_MATCH_WARNING);
    }
  } else if (target.kind === 'class') {
    for (const ancestor of ctx.indexes.classAncestors(target.id as ClassId)) add(ancestor, BROADER_CLASS_WARNING);
  }
  return out;
}

/**
 * Every backward step that could have produced `target` as a main product, stated moves first, then moves
 * inferred through a broader class (step C3). A class reactant is ONE move "any <class>" (step C4): it is
 * never expanded to one move per member (the route search completes it against a named start by membership).
 * `target` is not filtered by `drawnAsNode`: a query names it directly.
 */
export function backwardMovesInto(ctx: ProjectionContext, target: RecordRef, excludeReactionIds: ReadonlySet<string>): CarriedMove[] {
  const moves: CarriedMove[] = [];
  for (const made of producedAs(ctx, target)) {
    for (const production of ctx.indexes.productionsOf(made.ref)) {
      if (production.productRole !== 'main' || excludeReactionIds.has(production.reactionId)) continue;
      const reaction = ctx.indexes.get(production.reactionId);
      if (reaction?.kind !== 'reaction') continue;
      const outcome = reaction.outcomes.find((o) => o.id === production.outcomeId);
      if (outcome === undefined) continue;

      for (const participant of reaction.participants) {
        if (participant.role !== 'reactant' || !drawnAsNode(ctx, participant.ref)) continue;
        const shared = sharedVariants(reaction, participant, outcome);
        if (shared === null) continue;
        const sideInputs = sideInputsExcluding(ctx, reaction, participant.id);
        moves.push({
          reaction,
          outcome,
          carriedOut: target,
          sideInputs,
          conditionVariantIds: shared,
          carriedIn: { kind: participant.ref.kind, id: participant.ref.id },
          inferred: made.inferred,
          warnings: made.warning === null ? [] : [made.warning],
        });
      }
    }
  }
  return moves;
}
