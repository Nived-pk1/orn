/**
 * The mechanism list (7.4 C): every mechanism with its aliases, mechanism classes as words, the number of reactions that use it (the reaction's
 * `mechanismIds` and its outcomes' links) and the number of steps over all its variants. Text matches the name and the aliases (folded). An
 * exam scope keeps a mechanism with at least one reaction that is not outside it. A mechanism with no text (summary, study notes, notes), no step
 * and no reaction is EMPTY: it is not in `rows`; `empty` lists it for Studio. Order: folded name, then id. Pure and derived.
 */
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, Mechanism, MechanismId } from '../schema';
import { hasText, sortByName } from '../study-pages';
import { fold } from '../text/normalizer';

export interface MechanismFilter {
  readonly text: string;
  /** With an exam scope: true when the reaction is outside it. */
  readonly outside?: (reactionId: string) => boolean;
}

export interface MechanismRow {
  readonly id: string;
  readonly name: string;
  readonly aliases: readonly string[];
  /** The names of the mechanism classes (concepts). */
  readonly classes: readonly string[];
  readonly reactions: number;
  readonly steps: number;
}

export interface MechanismList {
  readonly rows: readonly MechanismRow[];
  readonly empty: readonly MechanismRow[];
  readonly total: number;
}

export const stepCount = (mechanism: Mechanism): number => mechanism.variants.reduce((sum, variant) => sum + variant.steps.length, 0);

const isEmpty = (record: Mechanism, reactions: number): boolean => reactions === 0 && stepCount(record) === 0 && !hasText(record.summary) && !hasText(record.studyNotes) && !hasText(record.notes);

export function filterMechanisms(state: CanonicalState, indexes: ReadonlyIndexes, filter: MechanismFilter): MechanismList {
  const needle = fold(filter.text.trim());
  const all = Object.values(state.records.mechanism);
  const rows: MechanismRow[] = [];
  const empty: MechanismRow[] = [];
  for (const record of all) {
    if (needle !== '' && ![record.name, ...record.aliases].some((name) => fold(name).includes(needle))) continue;
    const ids = [...new Set(indexes.reactionsByMechanism(record.id as MechanismId))].filter((id) => state.records.reaction[id as never] !== undefined);
    const row: MechanismRow = {
      id: record.id,
      name: record.name,
      aliases: record.aliases,
      classes: record.mechanismClasses.flatMap((one) => state.records.concept[one.conceptId]?.name ?? []),
      reactions: ids.length,
      steps: stepCount(record),
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
