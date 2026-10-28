/**
 * "Made directly from" (step 7.2a C1; ADR-042 DIRECT references only): the reactions that name a target as an outcome product, grouped by
 * the substrate each carries through (`primarySubstrateOf`, as the family page does). A class target matches only reactions that name the
 * class itself: route search, not this list, also finds its members. Derived on demand from the indexes, never stored.
 */
import { primarySubstrateOf } from '../../indexes/navigator-rollup';
import type { Reaction, RecordRef } from '../../schema';
import { fold } from '../../text/normalizer';
import type { ProjectionContext } from '../contracts';
import { createDescriber } from '../family/describe';

/** The words of the group that holds reactions with no carried substrate. */
export const NO_STARTING_MATERIAL = 'No starting material marked';

export interface DirectReaction {
  readonly reactionId: string;
  readonly name: string;
  /** Outside the chosen exam scope (marked, never hidden). */
  readonly outside: boolean;
}

export interface DirectGroup {
  /** The carried substrate's ID, or "none". */
  readonly key: string;
  readonly substrate: RecordRef | null;
  readonly name: string;
  readonly reactions: readonly DirectReaction[];
}

export interface DirectPrecursors {
  readonly target: RecordRef;
  readonly groups: readonly DirectGroup[];
  /** Distinct reactions in all the groups. */
  readonly reactionCount: number;
}

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const NONE = 'none';

export function directPrecursors(ctx: ProjectionContext, target: RecordRef, scopeOf: ProjectionContext['scopeOf']): DirectPrecursors {
  const describer = createDescriber(ctx.state);
  const seen = new Set<string>();
  const byKey = new Map<string, { substrate: RecordRef | null; name: string; reactions: DirectReaction[] }>();
  for (const production of ctx.indexes.productionsOf(target)) {
    if (seen.has(production.reactionId)) continue;
    const reaction = ctx.state.records.reaction[production.reactionId] as Reaction | undefined;
    if (reaction === undefined) continue;
    seen.add(production.reactionId);
    const carried = primarySubstrateOf(ctx.indexes, reaction);
    const substrate: RecordRef | null = carried === undefined ? null : { kind: carried.ref.kind, id: carried.ref.id };
    const key = substrate === null ? NONE : substrate.id;
    let group = byKey.get(key);
    if (group === undefined) {
      group = { substrate, name: substrate === null ? NO_STARTING_MATERIAL : (describer.describe(substrate)?.name ?? substrate.id), reactions: [] };
      byKey.set(key, group);
    }
    group.reactions.push({ reactionId: reaction.id, name: reaction.name, outside: scopeOf({ kind: 'reaction', id: reaction.id }) === 'outside' });
  }
  const groups = [...byKey.entries()]
    .map(([key, group]): DirectGroup => ({ key, ...group, reactions: group.reactions.sort((a, b) => compare(fold(a.name), fold(b.name)) || compare(a.reactionId, b.reactionId)) }))
    .sort((a, b) => (a.key === NONE ? 1 : 0) - (b.key === NONE ? 1 : 0) || compare(fold(a.name), fold(b.name)) || compare(a.key, b.key));
  return { target: { kind: target.kind, id: target.id }, groups, reactionCount: seen.size };
}
