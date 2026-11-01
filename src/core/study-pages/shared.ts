/**
 * What the Named reactions and Mechanisms pages share (7.4 C): links with names, a folded list of reactions (examples under their general
 * reaction, the 7.3a rule), the caveats that target a record or its reactions, and the chapters a record is in. Pure and derived; nothing
 * is stored.
 */
import { buildChapterIndex } from '../chapters/build-index';
import { foldExamples } from '../graph/family/examples';
import type { ReadonlyIndexes } from '../indexes/contracts';
import type { CanonicalState, RecordRef } from '../schema';
import { fold } from '../text/normalizer';

export interface Link {
  readonly id: string;
  readonly name: string;
}

export interface FoldedReactions {
  /** The reactions drawn as cards (examples folded away), by folded name then id. */
  readonly reactions: readonly string[];
  readonly examplesOf: ReadonlyMap<string, readonly string[]>;
  readonly exampleOf: ReadonlyMap<string, string>;
  /** Distinct reactions, folded examples included. */
  readonly count: number;
}

export interface CaveatLine {
  readonly id: string;
  readonly title: string;
  /** Rich text as stored. */
  readonly statement: string;
  readonly importance: string | undefined;
}

export const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';

export function sortByName<T extends { readonly id: string; readonly name: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const x = fold(a.name);
    const y = fold(b.name);
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** A link to a record of `kind` by id; `undefined` for a record that is not there (callers leave it out). */
export function linkOf(state: CanonicalState, kind: 'concept' | 'named_reaction' | 'mechanism', id: string): Link | undefined {
  const record = (state.records[kind] as Readonly<Record<string, { readonly name: string } | undefined>>)[id];
  return record === undefined ? undefined : { id, name: record.name };
}

export function foldedReactions(state: CanonicalState, ids: readonly string[]): FoldedReactions {
  const reactions = state.records.reaction;
  const distinct = [...new Set(ids)].filter((id) => reactions[id as never] !== undefined);
  const sorted = [...distinct].sort((a, b) => {
    const x = fold(reactions[a as never]?.name ?? a);
    const y = fold(reactions[b as never]?.name ?? b);
    return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
  });
  const folding = foldExamples(sorted, {
    instanceOf: (id) => reactions[id as never]?.instanceOfId,
    isGeneric: (id) => reactions[id as never]?.scope === 'generic',
    sortKey: (id) => fold(reactions[id as never]?.name ?? id),
  });
  return { reactions: folding.shown, examplesOf: folding.examplesOf, exampleOf: folding.exampleOf, count: distinct.length };
}

/** The caveats that target any of `refs`, each once, by folded title then id. */
export function caveatLines(state: CanonicalState, indexes: Pick<ReadonlyIndexes, 'caveatsFor'>, refs: readonly RecordRef[]): CaveatLine[] {
  const seen = new Set<string>();
  const lines: CaveatLine[] = [];
  for (const ref of refs) {
    for (const found of indexes.caveatsFor(ref)) {
      if (seen.has(found.id)) continue;
      seen.add(found.id);
      const caveat = state.records.caveat[found.id as never];
      if (caveat !== undefined) lines.push({ id: caveat.id, title: caveat.title, statement: caveat.statement, importance: caveat.importance });
    }
  }
  return lines.sort((a, b) => {
    const x = fold(a.title);
    const y = fold(b.title);
    return x < y ? -1 : x > y ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function chaptersOfRecord(state: CanonicalState, ref: RecordRef): Link[] {
  const index = buildChapterIndex(state);
  const titles = new Map(index.chapters.map((chapter) => [chapter.id as string, chapter.title] as const));
  return index.membershipsOf(ref).map((membership) => ({ id: membership.chapterId as string, name: titles.get(membership.chapterId) ?? membership.chapterId }));
}
