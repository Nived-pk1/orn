/**
 * "Show full equation" at L1 of a reaction (step 5.9a review, follow-up b): a disclosure with one line per outcome, each the whole
 * equation as the core wrote it (every reactant with its coefficient, a DRAWN arrow with the reagents and conditions over and under it,
 * every product with the card's selectivity word). Formulas are set in their typography; the text is always a React child, never markup.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { fullEquationsOfReaction, type ArrowTextPart, type FullEquation } from '@/core/graph';
import type { Reaction } from '@/core/schema';
import { partsToRuns } from '@/render/scene';
import { EquationArrow } from '@/ui/primitives';
import { useInspectorEnv } from './env';

function Parts(props: { readonly parts: readonly ArrowTextPart[] }): ReactNode {
  // Runs have no identity; the list is replaced as a whole, so the index is the key.
  return partsToRuns(props.parts).map((run, index) => {
    if (run.script === 'sub') return <sub key={index}>{run.text}</sub>;
    if (run.script === 'sup') return <sup key={index}>{run.text}</sup>;
    return <span key={index}>{run.text}</span>;
  });
}

function Line(props: { readonly equation: FullEquation; readonly label: string | undefined }) {
  const { reactants, products, arrow } = props.equation;
  return (
    <li aria-label={`${props.label === undefined ? '' : `${props.label}: `}${props.equation.text}`}>
      {props.label === undefined ? null : <strong>{props.label}: </strong>}
      <span>{reactants.length === 0 ? 'nothing listed' : reactants.map((t) => t.text).join(' + ')}</span>{' '}
      <EquationArrow above={arrow.above.length === 0 ? null : <Parts parts={arrow.above} />} below={arrow.below.length === 0 ? null : <Parts parts={arrow.below} />} />{' '}
      <span>{products.length === 0 ? 'nothing listed' : products.map((t) => t.text).join(' + ')}</span>
    </li>
  );
}

export function FullEquations(props: { readonly record: Reaction }) {
  const env = useInspectorEnv();
  const { record } = props;
  const [open, setOpen] = useState(false);
  const equations = useMemo(() => fullEquationsOfReaction(env.state, env.ports.indexes.current(), record), [env, record]);
  if (equations.length === 0) return null;
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Show full equation</summary>
      {open ? (
        <ul aria-label="Full equation">
          {equations.map((equation, index) => (
            <Line
              key={equation.outcomeId}
              equation={equation}
              label={equations.length > 1 ? (record.outcomes[index]?.label ?? `Outcome ${index + 1}`) : undefined}
            />
          ))}
        </ul>
      ) : null}
    </details>
  );
}
