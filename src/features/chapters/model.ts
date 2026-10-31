/**
 * What the Chapters view decides without drawing (step 7.3b D2, D3): the counts in words, and the page's filter. Pure; the chapters
 * themselves are the core's (`@/core/chapters`). No chemistry here: the filter reads names and the exam scope the app hands in.
 */
import type { ChapterContents, ChapterGroup, KindCounts } from '@/core/chapters';
import { CHAPTER_GROUPS, type GroupKey } from '@/core/chapters';
import type { RecordRef } from '@/core/schema';

/** A group is drawn this many cards at a time. */
export const PAGE_SIZE = 30;

const WORDS: Readonly<Record<GroupKey, readonly [string, string]>> = {
  concepts: ['concept', 'concepts'],
  reactions: ['reaction', 'reactions'],
  named: ['named reaction', 'named reactions'],
  mechanisms: ['mechanism', 'mechanisms'],
  caveats: ['caveat', 'caveats'],
  compounds: ['compound or class', 'compounds and classes'],
  reagents: ['reagent', 'reagents'],
  routes: ['route', 'routes'],
  transformations: ['transformation', 'transformations'],
};

/** "8 concepts · 24 reactions · 5 caveats": every kind that has records, core and the others together, in the page's order. */
export function countsWords(counts: KindCounts): string {
  const parts = CHAPTER_GROUPS.flatMap((group) => {
    const own = counts[group.key];
    const n = own.core + own.other;
    return n === 0 ? [] : [`${n} ${WORDS[group.key][n === 1 ? 0 : 1]}`];
  });
  return parts.length === 0 ? 'Nothing mapped yet' : parts.join(' · ');
}

export const kindWord = (key: GroupKey, n: number): string => WORDS[key][n === 1 ? 0 : 1];

export interface PageFilter {
  readonly kinds: readonly GroupKey[];
  readonly text: string;
  readonly onlyInScope: boolean;
}

export interface FilteredContents {
  readonly groups: readonly ChapterGroup[];
  /** Records the filter left out (examples folded under a card are not counted). */
  readonly hidden: number;
}

const fold = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** The chapter's contents after the kind chips, the name box and "Only <exam version>". Parts and groups left empty are dropped. */
export function filterContents(
  contents: ChapterContents,
  filter: PageFilter,
  nameOf: (ref: RecordRef) => string,
  outside: ((ref: RecordRef) => boolean) | undefined,
): FilteredContents {
  const needle = fold(filter.text.trim());
  let hidden = 0;
  const groups: ChapterGroup[] = [];
  for (const group of contents.groups) {
    if (filter.kinds.length > 0 && !filter.kinds.includes(group.key)) {
      hidden += group.count;
      continue;
    }
    const parts = group.parts
      .map((part) => ({
        ...part,
        refs: part.refs.filter((ref) => {
          const keep = (needle === '' || fold(nameOf(ref)).includes(needle)) && !(filter.onlyInScope && outside?.(ref) === true);
          if (!keep) hidden += 1;
          return keep;
        }),
      }))
      .filter((part) => part.refs.length > 0);
    if (parts.length === 0) continue;
    groups.push({ ...group, parts, count: parts.reduce((sum, part) => sum + part.refs.length, 0) });
  }
  return { groups, hidden };
}
