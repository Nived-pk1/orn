/**
 * The counts of records in words (7.3b D2, moved to the core in 7.6 so the Chapters list and the Syllabus view say them the same way):
 * "8 concepts · 24 reactions · 5 caveats", every kind that has records, in the page's order. Studio adds the concepts with no text apart,
 * "8 concepts + 3 not written" (7.3c A3).
 */
import { CHAPTER_GROUPS, type GroupKey } from './types';

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

export const kindWord = (key: GroupKey, n: number): string => WORDS[key][n === 1 ? 0 : 1];

export function countWords(counts: Readonly<Record<GroupKey, number>>, unwritten = 0): string {
  const parts = CHAPTER_GROUPS.flatMap((group) => {
    const n = counts[group.key];
    const words = n === 0 ? undefined : `${n} ${kindWord(group.key, n)}`;
    const apart = group.key === 'concepts' && unwritten > 0 ? (words === undefined ? `${unwritten} ${kindWord('concepts', unwritten)} not written` : `+ ${unwritten} not written`) : undefined;
    const joined = words !== undefined && apart !== undefined ? `${words} ${apart}` : (words ?? apart);
    return joined === undefined ? [] : [joined];
  });
  return parts.length === 0 ? 'Nothing mapped yet' : parts.join(' · ');
}
