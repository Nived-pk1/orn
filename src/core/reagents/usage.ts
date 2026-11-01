/**
 * What uses one reagent (7.3c C2). One section per profile of the reagent, in the reagent's own order, holding the DISTINCT reactions whose
 * participant names this reagent with that profile id; then one for "no profile". A reaction used two ways is in each section; the total is its
 * distinct reactions. Inside a section the examples fold under their general reaction (`foldExamples`), then folded name, then id. Per reaction
 * the facts of each use: role, phase, strength, dry, quantity and the stage (when the reaction has two or more). Also `partOf`: the reagents
 * whose components include this one. Pure and derived; only direct references to the reagent count (never its species).
 */
import { foldExamples } from '../graph/family/examples';
import type { CanonicalState, Participant, Reaction, Reagent } from '../schema';
import { fold } from '../text/normalizer';
import type { ReagentIndexes } from './list';
import { shownName } from './names';
import type { UsedFacts } from './words';

export interface UsageSection {
  /** The profile id; null for "used without a profile". */
  readonly profileId: string | null;
  readonly profile: Reagent['profiles'][number] | undefined;
  /** The cards of the section: distinct reactions, examples folded away. */
  readonly reactions: readonly string[];
  readonly examplesOf: ReadonlyMap<string, readonly string[]>;
  readonly exampleOf: ReadonlyMap<string, string>;
  /** Every reaction of the section (cards and folded examples) to its uses. */
  readonly factsOf: ReadonlyMap<string, readonly UsedFacts[]>;
  /** Distinct reactions in the section, folded examples included. */
  readonly count: number;
}

export interface ReagentUsage {
  readonly sections: readonly UsageSection[];
  /** Distinct reactions that use the reagent, across all sections. */
  readonly total: number;
  readonly partOf: readonly { readonly id: string; readonly name: string }[];
}

function quantityOf(quantity: Participant['quantity']): string | undefined {
  if (quantity === undefined) return undefined;
  if (quantity.text !== undefined) return quantity.text;
  const parts = [quantity.equivalents === undefined ? undefined : `${quantity.equivalents} equiv.`, quantity.qualifier];
  const joined = parts.filter((part): part is string => part !== undefined).join(', ');
  return joined === '' ? undefined : joined;
}

function factsOf(reaction: Reaction, participant: Participant): UsedFacts {
  const stages = reaction.stages;
  const at = stages.length < 2 ? -1 : stages.findIndex((stage) => stage.participantIds.includes(participant.id));
  const quantity = quantityOf(participant.quantity);
  return {
    role: participant.role,
    ...(participant.phase === undefined ? {} : { phase: participant.phase }),
    ...(participant.strength === undefined ? {} : { strength: participant.strength }),
    ...(participant.dry === undefined ? {} : { dry: participant.dry }),
    ...(quantity === undefined ? {} : { quantity }),
    ...(at < 0 ? {} : { stage: { position: at + 1, of: stages.length } }),
  };
}

export function reagentUsage(state: CanonicalState, indexes: ReagentIndexes, reagentId: string): ReagentUsage {
  const reagent = state.records.reagent[reagentId];
  if (reagent === undefined) return { sections: [], total: 0, partOf: [] };
  const reactions = state.records.reaction;
  const reactionIds = [...new Set(indexes.reactionsByReagent(reagentId as Reagent['id']))].filter((id) => reactions[id] !== undefined);
  const buckets = new Map<string | null, Map<string, UsedFacts[]>>([
    ...reagent.profiles.map((profile) => [profile.id as string | null, new Map<string, UsedFacts[]>()] as const),
    [null, new Map<string, UsedFacts[]>()],
  ]);
  for (const reactionId of reactionIds) {
    const reaction = reactions[reactionId] as Reaction;
    for (const participant of reaction.participants) {
      if (participant.ref.kind !== 'reagent' || participant.ref.id !== reagentId) continue;
      const key = participant.profileId !== undefined && buckets.has(participant.profileId) ? participant.profileId : null;
      const bucket = buckets.get(key) as Map<string, UsedFacts[]>;
      const list = bucket.get(reactionId) ?? [];
      list.push(factsOf(reaction, participant));
      bucket.set(reactionId, list);
    }
  }
  const sections: UsageSection[] = [];
  for (const [profileId, bucket] of buckets) {
    if (profileId === null && bucket.size === 0) continue;
    const ordered = [...bucket.keys()].sort((a, b) => {
      const x = fold(reactions[a]?.name ?? a);
      const y = fold(reactions[b]?.name ?? b);
      return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
    });
    const folding = foldExamples(ordered, {
      instanceOf: (id) => reactions[id]?.instanceOfId,
      isGeneric: (id) => reactions[id]?.scope === 'generic',
      sortKey: (id) => fold(reactions[id]?.name ?? id),
    });
    sections.push({
      profileId,
      profile: profileId === null ? undefined : reagent.profiles.find((profile) => profile.id === profileId),
      reactions: folding.shown,
      examplesOf: folding.examplesOf,
      exampleOf: folding.exampleOf,
      factsOf: bucket,
      count: bucket.size,
    });
  }
  const partOf = Object.values(state.records.reagent)
    .filter((other) => other.id !== reagentId && other.components.some((part) => part.ref.kind === 'reagent' && part.ref.id === reagentId))
    .map((other) => ({ id: other.id as string, name: shownName(other, other.id) }))
    .sort((a, b) => (fold(a.name) < fold(b.name) ? -1 : fold(a.name) > fold(b.name) ? 1 : a.id < b.id ? -1 : 1));
  return { sections, total: reactionIds.length, partOf };
}
