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

/** The same equation without the word "exclusive" on its products; the very same object when it has none. */
export function withoutExclusive(equation: FullEquation): FullEquation {
  if (!equation.products.some((term) => term.word === EXCLUSIVE)) return equation;
  return { ...equation, products: equation.products.map(quiet) };
}
