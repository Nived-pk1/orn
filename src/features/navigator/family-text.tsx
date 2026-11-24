/**
 * Text runs in HTML (step 5.5b): the arrow text and formulas of a card. Sub and superscripts are elements, a run's text is always a
 * React child (never markup; SECURITY §2).
 */
import type { ArrowTextPart } from '@/core/graph';
import { formulaBreaks, Runs } from '@/render/equation';
import { formulaRuns, partsToRuns } from '@/render/scene';

export { Runs };

export const FormulaText = (props: { readonly formula: string }) => <Runs runs={formulaRuns(props.formula)} />;

/** One side of an arrow: the parts joined as on the overview ("conc. H2SO4, 443 K"). */
export const ArrowSide = (props: { readonly parts: readonly ArrowTextPart[] }) => <Runs runs={partsToRuns(props.parts)} />;

/** The characters of one side of an arrow, for an accessible name. */
export const sideText = (parts: readonly ArrowTextPart[]): string => partsToRuns(parts).map((run) => run.text).join('');

/**
 * A formula in a substance box (step 8.5d R3): it keeps its font size, never breaks inside a group ("CH3", "COO"); it wraps at a space and after
 * a bond dash, and the box grows taller. Nothing is clipped.
 */
export function BoxFormula(props: { readonly formula: string }) {
  const words = props.formula.split(/\s+/).filter((word) => word !== '');
  return (
    <span data-box-formula="">
      {words.map((word, i) => (
        <span key={i}>
          {i > 0 ? ' ' : null}
          {formulaBreaks(word).map((part, j) => (
            <span key={j} style={{ whiteSpace: 'nowrap' }}>
              {j > 0 ? <wbr /> : null}
              <FormulaText formula={part} />
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
