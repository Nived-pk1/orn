/**
 * What the Named reactions list says in words without drawing (step 7.4 D). Pure; the records, their counts and the filters are the core's
 * (`@/core/named-reactions`). No chemistry here: only plurals and the lines of a row.
 */
import type { NamedReactionRow } from '@/core/named-reactions';
import { plural } from '@/core/text';

/** "also called A, B" with at most the first two aliases; nothing when there are none. */
export function alsoCalledWords(aliases: readonly string[]): string | undefined {
  return aliases.length === 0 ? undefined : `also called ${aliases.slice(0, 2).join(', ')}`;
}

/** "Part of Friedel–Crafts reaction" (several parents are joined with a comma). */
export function partOfWords(parents: NamedReactionRow['parents']): string | undefined {
  return parents.length === 0 ? undefined : `Part of ${parents.map((parent) => parent.name).join(', ')}`;
}

/** "3 reactions · has a mechanism". */
export function usedWords(row: Pick<NamedReactionRow, 'reactions' | 'hasMechanism'>): string {
  return [plural(row.reactions, 'reaction', 'reactions'), ...(row.hasMechanism ? ['has a mechanism'] : [])].join(' · ');
}
