/**
 * A formula in the list and on a page, drawn with the same typography as the cards (sub and superscripts are elements; the text is always a
 * React child, never markup; SECURITY §2). It never breaks inside a word (7.3c A5).
 */
import { Runs } from '@/render/equation';
import { formulaRuns } from '@/render/scene';

export function Formula(props: { readonly formula: string }) {
  return (
    <span data-formula="" style={{ whiteSpace: 'nowrap' }}>
      <Runs runs={formulaRuns(props.formula)} />
    </span>
  );
}
