/**
 * What the Reagents view says in words without drawing (step 7.3c D1-D3). Pure; the reagents, their usage and the filters are the core's
 * (`@/core/reagents`). No chemistry here: only plurals, the family words and the lines of a row.
 */
import type { Backing, ReagentRow } from '@/core/reagents';
import type { ReagentFamily } from '@/core/schema';

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** "3 reactions · 2 profiles" (a reagent with no profile says so in the count: "0 profiles" is left out). */
export function usedWords(row: Pick<ReagentRow, 'reactions' | 'profiles'>): string {
  return [plural(row.reactions, 'reaction', 'reactions'), ...(row.profiles === 0 ? [] : [plural(row.profiles, 'profile', 'profiles')])].join(' · ');
}

/** "KMnO4's species link" is the box's job; this is the words of the line under the name: "Mixture of A, B" or nothing for a species. */
export function mixtureWords(backing: Backing | undefined): string | undefined {
  if (backing === undefined || backing.kind !== 'mixture') return undefined;
  return `Mixture of ${backing.parts.map((part) => part.name).join(', ')}`;
}

/** A reagent family in words: the stored value with spaces. */
export const familyWord = (family: ReagentFamily): string => family.replaceAll('_', ' ');

/** The count line of the list: "16 reagents", or "3 of 16 reagents" when a filter narrows it. */
export function countLine(shown: number, total: number): string {
  return shown === total ? plural(total, 'reagent', 'reagents') : `${shown} of ${plural(total, 'reagent', 'reagents')}`;
}

export const reactionsWord = (n: number): string => plural(n, 'reaction', 'reactions');
