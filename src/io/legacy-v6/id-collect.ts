/**
 * Registers EVERY legacy value that will need an ID with the ID space, before anything is mapped (step 3.9 decision, docs/MIGRATION.md
 * §4.2): compound IDs (also the ones only reactions refer to), reaction IDs, label remainders, concept / named-reaction / topic
 * texts, related-reaction pairs, and the functional-group and `compoundClass` texts that may become classes. Registering first is
 * what lets collisions be settled for the whole document at once. The set is a superset of what step 3.10 and 3.11 use (a hub's
 * decision "class / species" is not known yet); an unused registration costs nothing but a theoretical collision.
 *
 * Duplicate IDs in the legacy file (v6 does not forbid them) are never merged: the first record keeps the ID as its key, every
 * later one gets `<id>\u0000<n>`, which the sanitiser turns into a different, hash-carrying part.
 */
import { createLegacyIdSpace, type LegacyIdSpace } from './id-space';
import { parseLabel } from './label-parser';
import { arr, field, isObj, type LegacyObject } from './text';

export interface LegacyDocumentIds {
  readonly ids: LegacyIdSpace;
  /** `compounds[i]`'s key in the ID space (its ID, or `<id>\u0000<n>` for the n-th record that repeats an ID). */
  readonly compoundKeys: readonly string[];
  readonly reactionKeys: readonly string[];
  /** A legacy compound ID (as reactions refer to it) → the key of the FIRST compound that has it, as v6's lookups resolve it. */
  readonly compoundKeyOfId: ReadonlyMap<string, string>;
}

/** The text an ID is made of: a string as it is; anything else (a number, an object) as its JSON text. */
export const idKey = (id: unknown): string => (typeof id === 'string' ? id : (JSON.stringify(id) ?? String(id)));

function keysOf(records: readonly LegacyObject[]): string[] {
  const seen = new Map<string, number>();
  return records.map((record) => {
    const base = idKey(record.id);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}\u0000${n}`;
  });
}

const texts = (value: unknown): string[] => arr(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '');
const text = (value: unknown): string[] => (typeof value === 'string' && value.trim() !== '' ? [value] : []);

/** Builds the ID space of one v5 document. Total: never throws for any (JSON) input. */
export function createDocumentIds(data: { readonly compounds: readonly LegacyObject[]; readonly reactions: readonly LegacyObject[] }): LegacyDocumentIds {
  const compoundKeys = keysOf(data.compounds);
  const reactionKeys = keysOf(data.reactions);
  const compoundKeyOfId = new Map<string, string>();
  data.compounds.forEach((compound, index) => {
    const id = idKey(compound.id);
    if (!compoundKeyOfId.has(id)) compoundKeyOfId.set(id, compoundKeys[index] as string);
  });

  const referenced = new Set<string>();
  const labels = new Set<string>();
  const concepts = new Set<string>();
  const namedReactions = new Set<string>();
  const topics = new Set<string>();
  const firstReaction = new Map<string, string>();
  reactionKeys.forEach((key, index) => {
    const id = idKey(data.reactions[index]?.id);
    if (!firstReaction.has(id)) firstReaction.set(id, key);
  });
  const pairs: (readonly [string, string])[] = [];

  data.reactions.forEach((reaction, index) => {
    for (const participant of arr(reaction.participants)) {
      if (!isObj(participant)) continue;
      const ref = participant.ref;
      if (ref) {
        // JS truthiness, as v6 reads `p.ref`; a ref that is not text is keyed by its JSON, like a compound ID
        const key = idKey(ref);
        if (!compoundKeyOfId.has(key)) referenced.add(key);
      } else if (typeof participant.label === 'string') {
        const parsed = parseLabel(participant.label);
        // a label of tokens only has no remainder: the trimmed label itself names the record made for it (step 3.11a)
        if (parsed.kind === 'participant') {
          const named = parsed.remainder !== '' ? parsed.remainder : participant.label.trim();
          if (named !== '') labels.add(named);
        }
      }
    }
    for (const key of [reaction.reactionType, reaction.reactionFamily, field(reaction.mechanism, 'type')]) text(key).forEach((t) => concepts.add(t));
    for (const key of [field(reaction.jee, 'prerequisites'), field(reaction.jee, 'concepts')]) texts(key).forEach((t) => concepts.add(t));
    text(reaction.namedReaction).forEach((t) => namedReactions.add(t));
    text(reaction.chapter).filter((t) => t !== 'Uncategorised').forEach((t) => topics.add(t));
    for (const other of texts(reaction.relatedReactions)) {
      const target = firstReaction.get(other);
      if (target !== undefined && target !== reactionKeys[index]) pairs.push([reactionKeys[index] as string, target]);
    }
  });

  const functionalGroups = new Set<string>();
  const classTexts = new Set<string>();
  for (const compound of data.compounds) {
    text(compound.fgId).forEach((t) => functionalGroups.add(t));
    texts(compound.functionalGroups).forEach((t) => functionalGroups.add(t));
    text(compound.compoundClass).forEach((t) => classTexts.add(t));
  }

  const ids = createLegacyIdSpace({
    compoundIds: [...compoundKeys, ...referenced],
    reactionIds: reactionKeys,
    labels,
    concepts,
    namedReactions,
    topics,
    relatedPairs: pairs,
    functionalGroups,
    classTexts,
  });
  return { ids, compoundKeys, reactionKeys, compoundKeyOfId };
}
