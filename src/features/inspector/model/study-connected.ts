/**
 * The CONNECTED part of the Study inspector (step 8.1 Part C, item 7): the related lists of today, regrouped as small cards under plain
 * headings. A card is a title and one line: the reaction's arrow in words ("Ethanol → Ethanal") or the record's kind chip. Pure; empty
 * groups are not returned; a group holds at most MAX_CARDS cards and says its real total.
 */
import { relatedReactionsOf } from '@/core/graph';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, Reaction, RecordRef, Relationship } from '@/core/schema';
import { nameOf, recordOf } from './describe';
import { studyKindWord } from './study-words';

/** Most cards one group carries; "Show all n" shows these, and the total says when more exist. */
export const MAX_CARDS = 60;
/** Most records scanned when a class or a reagent family gathers its reactions or members. */
const MAX_SCANNED = 5000;

export interface Card {
  readonly ref: RecordRef;
  readonly title: string;
  /** One line under the title: the arrow in words for a reaction, else the kind in plain words. */
  readonly line: string;
}
export interface CardGroup {
  readonly key: string;
  readonly heading: string;
  readonly total: number;
  readonly cards: readonly Card[];
}
export interface Snapshot {
  readonly state: CanonicalState;
  readonly indexes: ReadonlyIndexes;
}

const refOf = (kind: string, id: string): RecordRef => ({ kind, id }) as RecordRef;
const reactionRef = (id: string): RecordRef => refOf('reaction', id);

/** "Ethanol → Ethanal": the first outcome's products against the reactants, by name; only the names, no formulas or conditions. */
export function arrowLine(state: CanonicalState, reaction: Reaction): string {
  const left = reaction.participants.filter((p) => p.role === 'reactant').map((p) => nameOf(state, p.ref));
  const right = (reaction.outcomes[0]?.products ?? []).map((p) => nameOf(state, p.ref));
  if (left.length === 0 && right.length === 0) return 'Reaction';
  return `${left.join(' + ')} → ${right.join(' + ')}`;
}

export function cardOf(state: CanonicalState, ref: RecordRef): Card | undefined {
  const record = recordOf(state, ref);
  if (record === undefined) return undefined;
  return { ref, title: nameOf(state, ref), line: ref.kind === 'reaction' ? arrowLine(state, record as Reaction) : studyKindWord(ref.kind) };
}

export function groupOf(snapshot: Snapshot, key: string, heading: string, refs: readonly RecordRef[]): CardGroup | undefined {
  const seen = new Set<string>();
  const cards: Card[] = [];
  let total = 0;
  for (const ref of refs) {
    const id = `${ref.kind}:${ref.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const card = cardOf(snapshot.state, ref);
    if (card === undefined) continue;
    total += 1;
    if (cards.length < MAX_CARDS) cards.push(card);
  }
  return total === 0 ? undefined : { key, heading, total, cards };
}

const reactionsOfSubstances = (indexes: ReadonlyIndexes, refs: readonly RecordRef[]): RecordRef[] => {
  const ids = new Set<string>();
  for (const ref of refs) for (const p of indexes.participationsOf(ref)) ids.add(p.reactionId);
  return [...ids].sort().map(reactionRef);
};
const madeBy = (indexes: ReadonlyIndexes, ref: RecordRef): RecordRef[] => [...new Set(indexes.productionsOf(ref).map((p) => p.reactionId))].sort().map(reactionRef);

/** Stored "commonly confused with" relationships of a record, the other end of each. */
function confusedWith(snapshot: Snapshot, ref: RecordRef): RecordRef[] {
  const out: RecordRef[] = [];
  for (const owner of snapshot.indexes.relationshipsOf(ref)) {
    const record = (snapshot.state.records.relationship as Readonly<Record<string, Relationship>>)[owner.id];
    if (record === undefined || record.type !== 'commonly_confused_with') continue;
    out.push(record.from.id === ref.id && record.from.kind === ref.kind ? record.to : record.from);
  }
  return out;
}

const RELATED_HEADINGS: Readonly<Record<string, string>> = {
  leads_on: 'Leads on to',
  comes_from: 'Comes from',
  same_transformation: 'Same transformation',
  same_named_family: 'Same named family',
  shares_mechanism: 'Shares a mechanism',
  same_reagent_family: 'Same reagent family',
};

function reactionGroups(snapshot: Snapshot, reaction: Reaction): CardGroup[] {
  const { indexes } = snapshot;
  const products = reaction.outcomes.flatMap((o) => o.products.map((p) => p.ref));
  const reactants = reaction.participants.filter((p) => p.role === 'reactant').map((p) => p.ref);
  const related = relatedReactionsOf(indexes, reaction).map((g) => groupOf(snapshot, g.key, RELATED_HEADINGS[g.key] ?? g.key, g.items.map((i) => reactionRef(i.reactionId))));
  const own = refOf('reaction', reaction.id);
  const examples = reaction.scope === 'generic' ? indexes.referrersOf(reaction.id).filter((r) => r.owner.kind === 'reaction' && r.path === 'instanceOfId').map((r) => reactionRef(r.owner.id)) : [];
  return [
    groupOf(snapshot, 'examples', 'Examples', examples.sort((a, b) => nameOf(snapshot.state, a).localeCompare(nameOf(snapshot.state, b)) || a.id.localeCompare(b.id))),
    groupOf(snapshot, 'makes', 'Makes', products),
    groupOf(snapshot, 'made-from', 'Made from', reactants),
    groupOf(snapshot, 'confused', 'Often confused with', confusedWith(snapshot, own)),
    ...related,
    groupOf(snapshot, 'learn-first', 'Learn first', reaction.prerequisiteConceptIds.map((id) => refOf('concept', id))),
  ].filter((g): g is CardGroup => g !== undefined);
}

export function connectedOf(snapshot: Snapshot, ref: RecordRef): CardGroup[] {
  const { state, indexes } = snapshot;
  const record = recordOf(state, ref);
  if (record === undefined) return [];
  const uses = (refs: readonly RecordRef[]): CardGroup | undefined => groupOf(snapshot, 'uses', 'Reactions that use it', refs);
  const confused = groupOf(snapshot, 'confused', 'Often confused with', confusedWith(snapshot, ref));
  let groups: (CardGroup | undefined)[] = [];
  switch (ref.kind) {
    case 'reaction':
      return reactionGroups(snapshot, record as Reaction);
    case 'species':
      groups = [uses(reactionsOfSubstances(indexes, [ref])), groupOf(snapshot, 'made-by', 'How it is made', madeBy(indexes, ref)), confused];
      break;
    case 'class': {
      const members = indexes.speciesInClass(ref.id as never, { transitive: true }).slice(0, MAX_SCANNED);
      groups = [uses(reactionsOfSubstances(indexes, [ref, ...members])), groupOf(snapshot, 'members', 'Compounds in this class', indexes.speciesInClass(ref.id as never, { transitive: false })), confused];
      break;
    }
    case 'reagent': {
      const families = new Set((record as { families: readonly string[] }).families);
      const same = Object.values(state.records.reagent as Readonly<Record<string, { id: string; families: readonly string[] }>>)
        .slice(0, MAX_SCANNED)
        .filter((r) => r.id !== ref.id && r.families.some((f) => families.has(f)))
        .map((r) => refOf('reagent', r.id));
      groups = [uses(indexes.reactionsByReagent(ref.id as never).map(reactionRef)), groupOf(snapshot, 'same-family', 'Same reagent family', same), confused];
      break;
    }
    case 'concept':
      groups = [uses(indexes.reactionsByConcept(ref.id as never, { includeDescendants: true }).map(reactionRef)), confused];
      break;
    case 'named_reaction':
      groups = [uses(indexes.reactionsByNamedReaction(ref.id as never, { includeDescendants: false }).map(reactionRef)), groupOf(snapshot, 'learn-first', 'Learn first', (record as { prerequisiteConceptIds: readonly string[] }).prerequisiteConceptIds.map((id) => refOf('concept', id))), confused];
      break;
    case 'mechanism':
      groups = [uses(indexes.reactionsByMechanism(ref.id as never).map(reactionRef)), confused];
      break;
    case 'transformation':
      groups = [uses(indexes.reactionsByTransformation(ref.id as never).map(reactionRef))];
      break;
    case 'caveat':
      groups = [groupOf(snapshot, 'applies', 'Applies to', (record as { targets: readonly { ref: RecordRef }[] }).targets.map((t) => t.ref))];
      break;
    default:
      return [];
  }
  return groups.filter((g): g is CardGroup => g !== undefined);
}
