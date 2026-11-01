/**
 * Text runs in HTML (step 5.5b): the arrow text and formulas of a card. Sub and superscripts are elements, a run's text is always a
 * React child (never markup; SECURITY §2).
 */
import { useLayoutEffect, useRef } from 'react';
import type { ArrowTextPart } from '@/core/graph';
import { Runs } from '@/render/equation';
import { formulaRuns, partsToRuns } from '@/render/scene';

export { Runs };

export const FormulaText = (props: { readonly formula: string }) => <Runs runs={formulaRuns(props.formula)} />;

/** One side of an arrow: the parts joined as on the overview ("conc. H2SO4, 443 K"). */
export const ArrowSide = (props: { readonly parts: readonly ArrowTextPart[] }) => <Runs runs={partsToRuns(props.parts)} />;

/** The characters of one side of an arrow, for an accessible name. */
export const sideText = (parts: readonly ArrowTextPart[]): string => partsToRuns(parts).map((run) => run.text).join('');

/** The smallest the text of a box shrinks to when its formula does not fit on one line even in the widest box (7.3c A5). */
export const MIN_FORMULA_SCALE = 0.85;

/**
 * A formula in a substance box (7.3c A5): it never breaks inside a word, only at spaces (a dash or a bracket is not a place to break). The
 * box widens up to the card's column (CSS); if the longest word still does not fit, the text shrinks, to no less than 85 %.
 */
export function BoxFormula(props: { readonly formula: string }) {
  const box = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (el === null) return;
    el.style.fontSize = '';
    const room = el.clientWidth;
    const need = el.scrollWidth;
    if (room > 0 && need > room) el.style.fontSize = `${Math.max(MIN_FORMULA_SCALE, room / need)}em`;
  });
  const words = props.formula.split(/\s+/).filter((word) => word !== '');
  return (
    <span ref={box} data-box-formula="">
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
