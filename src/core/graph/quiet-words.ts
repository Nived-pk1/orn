/**
 * What a student reads of an outcome (step 8.3, C8). "exclusive" only says "the one product", which textbooks do not write, so a student
 * edition leaves it out; "major", "minor" and the others are exam-relevant and stay. ONE function decides the word, for the card's caption
 * and for the equation's terms. Pure; the edition rule (`studyChrome.exclusiveWord`) says which reader asks.
 */
import type { EquationTerm, FullEquation } from './full-equation';

const EXCLUSIVE = 'exclusive';
const REGIO_SEPARATOR = ' · ';

/** The word to write under a product: `word` as it is when `exclusive` is wanted, else without "exclusive" (the regiochemistry after it stays). */
export function shownWordOf(word: string | null, exclusive: boolean): string | null {
  if (word === null || exclusive) return word;
  if (word === EXCLUSIVE) return null;
  return word.startsWith(`${EXCLUSIVE}${REGIO_SEPARATOR}`) ? word.slice(EXCLUSIVE.length + REGIO_SEPARATOR.length) : word;
}

const quiet = (term: EquationTerm): EquationTerm => {
  if (term.word !== EXCLUSIVE) return term;
  return { ...term, word: null, quantifier: null, text: term.text.replace(` (${term.quantifier === null ? '' : `${term.quantifier} `}${EXCLUSIVE})`, '') };
};

/**
 * The same equation without the word "exclusive" on its products; the very same object when it has none. The equation's own `text` (the line
 * and the screen reader's sentence) is rebuilt too: each changed term's text is swapped for its quiet text where it stands, so no consumer has to
 * clean a string.
 */
export function withoutExclusive(equation: FullEquation): FullEquation {
  if (!equation.products.some((term) => term.word === EXCLUSIVE)) return equation;
  const products = equation.products.map(quiet);
  let text = equation.text;
  equation.products.forEach((term, index) => {
    const now = products[index] as EquationTerm;
    if (now !== term) text = text.split(term.text).join(now.text);
  });
  return { ...equation, products, text };
}

/** Groups (of a reaction card) with their equation cleaned by `withoutExclusive`; a group with no equation is returned as it is. */
export function quietGroups<G extends { readonly equation?: FullEquation | undefined }>(groups: readonly G[]): G[] {
  return groups.map((group) => (group.equation === undefined ? group : { ...group, equation: withoutExclusive(group.equation) }));
}
