/**
 * The room the scheme keeps under a row for the names that hang under its drawings (equation step, part 6). A name is out of the flow (it
 * hangs from the bottom of its drawing, directly under it), so a row is exactly as tall as its tallest drawing and the "+" signs and the
 * arrow sit on the drawings' middle line; the room the names need below is reserved by the row, estimated here from the text (a name or
 * word wraps at about `CHARS_PER_LINE` characters of a column, `LINE_PX` per line). Pure arithmetic on strings: no chemistry.
 */
import type { EquationTerm } from '@/core/graph';

const CHARS_PER_LINE = 26;
const LINE_PX = 19;
/** The gap between a drawing and its name (the same as `--space-1`, 4 px). */
const GAP_PX = 4;

const linesOf = (text: string): number => Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));

/** The words printed under a term besides its name: the outcome's word (with its quantifier) or a role. */
export const wordOf = (term: EquationTerm): string | null =>
  term.word !== null ? `(${term.quantifier === null ? '' : `${term.quantifier} `}${term.word})` : term.role !== null ? `(${term.role})` : null;

/** The height in px that the tallest hanging text of these terms needs; 0 when there is none. */
export function hangOf(terms: readonly EquationTerm[], names: boolean): number {
  let tallest = 0;
  for (const term of terms) {
    const word = wordOf(term);
    const lines = (names ? linesOf(term.name) : 0) + (word === null ? 0 : linesOf(word));
    if (lines > 0) tallest = Math.max(tallest, lines * LINE_PX + GAP_PX);
  }
  return tallest;
}
