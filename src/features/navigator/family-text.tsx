/**
 * Text runs in HTML (step 5.5b): the arrow text and formulas of a card. Sub and superscripts are elements, a run's text is always a
 * React child (never markup; SECURITY §2).
 */
import type { ArrowTextPart } from '@/core/graph';
import { Runs } from '@/render/equation';
import { formulaRuns, partsToRuns } from '@/render/scene';

export { Runs };

export const FormulaText = (props: { readonly formula: string }) => <Runs runs={formulaRuns(props.formula)} />;

/** One side of an arrow: the parts joined as on the overview ("conc. H2SO4, 443 K"). */
export const ArrowSide = (props: { readonly parts: readonly ArrowTextPart[] }) => <Runs runs={partsToRuns(props.parts)} />;

/** The characters of one side of an arrow, for an accessible name. */
export const sideText = (parts: readonly ArrowTextPart[]): string => partsToRuns(parts).map((run) => run.text).join('');

/** The smallest the text of a box shrinks to when a formula is long (7.3c A5). */
export const MIN_FORMULA_SCALE = 0.85;

/**
 * How much a long formula shrinks, from the length of its longest word alone (no layout is measured: a measure on render made the virtual
 * list re-measure in a loop in Firefox). The box widens first (CSS, up to the card's column); only a very long word shrinks, never below 85 %.
 */
export function formulaScale(longestWord: number): number {
  if (longestWord <= 14) return 1;
  return longestWord >= 24 ? MIN_FORMULA_SCALE : 0.92;
}

/** A formula in a substance box (7.3c A5): it never breaks inside a word, only at spaces (a dash or a bracket is not a place to break). */
export function BoxFormula(props: { readonly formula: string }) {
  const words = props.formula.split(/\s+/).filter((word) => word !== '');
  const scale = formulaScale(Math.max(0, ...words.map((word) => [...word].length)));
  return (
    <span data-box-formula="" {...(scale === 1 ? {} : { style: { fontSize: `${scale}em` } })}>
      {words.map((word, i) => (
        <span key={i}>
          {i > 0 ? ' ' : null}
          <span style={{ whiteSpace: 'nowrap' }}>
            <FormulaText formula={word} />
          </span>
        </span>
      ))}
    </span>
  );
}
