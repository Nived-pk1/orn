/**
 * Starting points for a NEW reaction draft (ADR-040 addendum, step 6.7a decisions C2 and C3), as pure seeds for `openSession`'s `seed`:
 *  - `duplicateSeed`: everything the reaction's own record holds, every nested ID new and the copy's own links following them (the same
 *    walk as `duplicateRecord`, through the reference engine). Records that point AT the original (relationships, topic mappings, exam
 *    relevance, caveat targets) are not part of the record, so they are not copied. The ID, kind, provenance and review stay the blank
 *    draft's (a new ID, origin user, lifecycle draft, status unreviewed).
 *  - `specificSeed`: a specific reaction that is an instance of a generic one. Participants, stages, condition variants and outcomes are
 *    copied with new IDs; every CLASS participant and class product stays as its class `ref` and carries `slotOfClassId`, a key the schema
 *    does not know, so L1 refuses Save with its "Unknown field" finding until the slot is filled (the form then removes the key). The
 *    name starts empty. Classification, mechanism links (and each outcome's), named reaction and transformation links are copied (T2, 6.7b); intermediates, notes, study notes, tags and citations are not.
 * No chemistry: a slot is any class reference; which species fit it is the picker's question.
 */
import type { CanonicalState, Reaction, RecordRef } from '../schema';
import { referenceEngine } from '../references';
import type { CommandContext } from '../commands/contracts';
import { recordAt } from '../commands/lookup';

/** The draft-only key that marks an empty slot and remembers the class it stands for. */
export const SLOT_KEY = 'slotOfClassId';

const prefixOf = (id: string): string => id.slice(0, id.indexOf('_'));

/** A copy of the reaction in which the record and every nested ID are new and internal references follow them. */
function renumbered(source: Reaction, ctx: Pick<CommandContext, 'newId'>): Reaction {
  const idMap = new Map<string, string>();
  const fresh = (id: string): void => {
    if (!idMap.has(id)) idMap.set(id, ctx.newId(prefixOf(id)));
  };
  fresh(source.id);
  for (const nested of referenceEngine.nestedIds(source)) fresh(nested.id);
  return referenceEngine.remap(source, idMap) as Reaction;
}

const reactionAt = (state: CanonicalState, ref: RecordRef): Reaction | undefined => {
  if (ref.kind !== 'reaction') return undefined;
  const found = recordAt(state, ref);
  return found?.kind === 'reaction' ? found : undefined;
};

export function duplicateSeed(state: CanonicalState, ref: RecordRef, ctx: Pick<CommandContext, 'newId'>): Readonly<Record<string, unknown>> | undefined {
  const source = reactionAt(state, ref);
  if (source === undefined) return undefined;
  const { id: _id, kind: _kind, provenance: _provenance, review: _review, ...own } = renumbered(source, ctx);
  return { ...own, name: `${own.name} (copy)` };
}

export function specificSeed(state: CanonicalState, ref: RecordRef, ctx: Pick<CommandContext, 'newId'>): Readonly<Record<string, unknown>> | undefined {
  const source = reactionAt(state, ref);
  if (source === undefined || source.scope !== 'generic') return undefined;
  const copy = renumbered(source, ctx);
  const slot = <T extends { readonly ref: { readonly kind: string; readonly id: string } }>(item: T): T | (T & Record<string, string>) =>
    item.ref.kind === 'class' ? { ...item, [SLOT_KEY]: item.ref.id } : item;
  return {
    name: '',
    aliases: [],
    scope: 'specific',
    instanceOfId: source.id,
    participants: copy.participants.map(slot),
    stages: copy.stages,
    conditionVariants: copy.conditionVariants,
    outcomes: copy.outcomes.map((outcome) => ({ ...outcome, products: outcome.products.map(slot) })),
    intermediates: [],
    mechanismIds: copy.mechanismIds,
    reactionTypes: copy.reactionTypes,
    mechanismClasses: copy.mechanismClasses,
    namedReactionIds: copy.namedReactionIds,
    transformationIds: copy.transformationIds,
  };
}
