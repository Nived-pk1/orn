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
