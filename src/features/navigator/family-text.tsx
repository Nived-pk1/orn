/**
 * Text runs in HTML (step 5.5b): the arrow text and formulas of a card. Sub and superscripts are elements, a run's text is always a
 * React child (never markup; SECURITY §2).
 */
import type { ReactNode } from 'react';
import type { ArrowTextPart } from '@/core/graph';
import { formulaRuns, partsToRuns, type FormattedText } from '@/render/scene';

export function Runs(props: { readonly runs: FormattedText }): ReactNode {
  return props.runs.map((run, index) => {
    // Runs have no identity; the list is replaced as a whole, so the index is the key.
    const text = run.emphasis === 'strong' ? <strong>{run.text}</strong> : run.emphasis === 'em' ? <em>{run.text}</em> : run.text;
    if (run.script === 'sub') return <sub key={index}>{text}</sub>;
    if (run.script === 'sup') return <sup key={index}>{text}</sup>;
    return <span key={index}>{text}</span>;
  });
}

export const FormulaText = (props: { readonly formula: string }) => <Runs runs={formulaRuns(props.formula)} />;

/** One side of an arrow: the parts joined as on the overview ("conc. H2SO4, 443 K"). */
export const ArrowSide = (props: { readonly parts: readonly ArrowTextPart[] }) => <Runs runs={partsToRuns(props.parts)} />;

/** The characters of one side of an arrow, for an accessible name. */
export const sideText = (parts: readonly ArrowTextPart[]): string => partsToRuns(parts).map((run) => run.text).join('');
