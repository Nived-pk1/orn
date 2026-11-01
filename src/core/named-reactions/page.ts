/**
 * One named reaction's page (7.4 C): summary, typical conditions, aliases, parents and children, concepts and prerequisite concepts, the
 * reactions of its family (examples folded under their general reaction, the 7.3a rule), the mechanisms those reactions reach, the caveats on
 * it and on its reactions, its chapters and study notes. Pure and derived.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState } from '../schema';
import { caveatLines, chaptersOfRecord, foldedReactions, linkOf, sortByName, type CaveatLine, type FoldedReactions, type Link } from '../study-pages';
import { childIds, familyReactions, mechanismsReached } from './family';

export interface NamedReactionPage {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly summary: string | undefined;
  readonly typicalConditions: string | undefined;
  readonly studyNotes: string | undefined;
  readonly notes: string | undefined;
  readonly parents: readonly Link[];
  readonly children: readonly Link[];
  readonly concepts: readonly Link[];
  readonly prerequisites: readonly Link[];
  readonly reactions: FoldedReactions;
  readonly mechanisms: readonly Link[];
  readonly caveats: readonly CaveatLine[];
  readonly chapters: readonly Link[];
}

const links = (state: CanonicalState, kind: 'concept' | 'named_reaction' | 'mechanism', ids: readonly string[]): Link[] => sortByName(ids.flatMap((id) => linkOf(state, kind, id) ?? []));

export function namedReactionPage(state: CanonicalState, indexes: ReadonlyIndexes, id: string): NamedReactionPage | undefined {
  const record = state.records.named_reaction[id as never];
  if (record === undefined) return undefined;
  const ids = familyReactions(indexes, id);
  return {
    id,
    name: record.name,
    aliases: record.aliases,
    summary: record.summary,
    typicalConditions: record.typicalConditions,
    studyNotes: record.studyNotes,
    notes: record.notes,
    parents: links(state, 'named_reaction', record.parentIds),
    children: links(state, 'named_reaction', childIds(state, indexes, id)),
    concepts: links(state, 'concept', record.conceptIds),
    prerequisites: links(state, 'concept', record.prerequisiteConceptIds),
    reactions: foldedReactions(state, ids),
    mechanisms: links(state, 'mechanism', mechanismsReached(state, ids)),
    caveats: caveatLines(state, indexes, [{ kind: 'named_reaction', id } as never, ...ids.map((reactionId) => ({ kind: 'reaction', id: reactionId }) as never)]),
    chapters: chaptersOfRecord(state, { kind: 'named_reaction', id } as never),
  };
}
