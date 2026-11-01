/**
 * The named-reaction list (7.4 C): every named reaction with its parents, aliases, the number of reactions of its family (itself and the
 * records below it) and whether a mechanism is reached. Text matches the name and the aliases (folded). An exam scope keeps a record with at
 * least one reaction that is not outside it. A record with no text (summary, study notes, notes) and no reaction is EMPTY: it is not in `rows`;
 * `empty` lists it for Studio ("Not written yet"). Order: folded name, then id. Pure and derived.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, NamedReaction } from '../schema';
import { hasText, linkOf, sortByName, type Link } from '../study-pages';
import { fold } from '../text/normalizer';
import { familyReactions, mechanismsReached } from './family';

export interface NamedReactionFilter {
  readonly text: string;
  /** With an exam scope: true when the reaction is outside it. */
  readonly outside?: (reactionId: string) => boolean;
}

export interface NamedReactionRow {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly parents: readonly Link[];
  /** Distinct reactions of the record and of the family below it. */
  readonly reactions: number;
  readonly hasMechanism: boolean;
}

export interface NamedReactionList {
  readonly rows: readonly NamedReactionRow[];
  /** Records with no text and no reaction (Studio lists them apart). Hidden under an exam scope. */
  readonly empty: readonly NamedReactionRow[];
  /** All named reactions in the dataset. */
  readonly total: number;
}

const isEmpty = (record: NamedReaction, reactions: number): boolean => reactions === 0 && !hasText(record.summary) && !hasText(record.studyNotes) && !hasText(record.notes);

export function filterNamedReactions(state: CanonicalState, indexes: ReadonlyIndexes, filter: NamedReactionFilter): NamedReactionList {
  const needle = fold(filter.text.trim());
  const all = Object.values(state.records.named_reaction);
  const rows: NamedReactionRow[] = [];
  const empty: NamedReactionRow[] = [];
  for (const record of all) {
    if (needle !== '' && ![record.name, ...record.aliases].some((name) => fold(name).includes(needle))) continue;
    const ids = familyReactions(indexes, record.id);
    const row: NamedReactionRow = {
      id: record.id,
      name: record.name,
      aliases: record.aliases,
      parents: record.parentIds.flatMap((id) => linkOf(state, 'named_reaction', id) ?? []),
      reactions: ids.length,
      hasMechanism: mechanismsReached(state, ids).length > 0,
    };
    if (isEmpty(record, ids.length)) {
      if (filter.outside === undefined) empty.push(row);
      continue;
    }
    if (filter.outside !== undefined && !ids.some((id) => filter.outside?.(id) !== true)) continue;
    rows.push(row);
  }
  return { rows: sortByName(rows), empty: sortByName(empty), total: all.length };
}
