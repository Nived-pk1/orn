/**
 * A formula in the formula typography (subscripts), for a preview or a table cell. The text INPUT stays plain text; this only shows it.
 * A run's text is always a React child, never markup (SECURITY §2).
 */
import { Runs } from '@/render/equation';
import { formulaRuns } from '@/render/scene';

export const FormulaText = (props: { readonly formula: string }) => <Runs runs={formulaRuns(props.formula)} />;
