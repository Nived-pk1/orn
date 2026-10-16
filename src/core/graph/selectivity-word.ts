/**
 * The ONE vocabulary of a product's selectivity in words (phone mode B, part 3): the family card writes it under a product, and the full
 * equation writes the same word after the product's name. `unspecified` has no word (nothing is written). Pure data: the schema's value in, the word out.
 */
export type SelectivityWord = 'exclusive' | 'major' | 'minor' | 'trace' | 'mixture component';

const WORD: Readonly<Record<string, SelectivityWord>> = {
  exclusive: 'exclusive',
  major: 'major',
  minor: 'minor',
  trace: 'trace',
  mixture_component: 'mixture component',
};

/** The word for a stored selectivity, or null (`unspecified`, or a value this vocabulary does not know). */
export function selectivityWordOf(selectivity: string): SelectivityWord | null {
  return WORD[selectivity] ?? null;
}
