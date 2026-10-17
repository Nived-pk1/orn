/**
 * "Show full equation" at L1 of a reaction (equation step, part 5; before: step 5.9a review, follow-up b): a disclosure with one textbook
 * scheme per outcome (`render/equation`): every reactant with its coefficient, an arrow with the reagents over it and the conditions
 * under it, every product with the card's selectivity word. Which terms are drawn and which are formulas is decided by the core from the
 * chem facts. The "Names" switch (one setting, saved with the panels) is in the first scheme; the text is always a React child, never markup.
 */
import { useMemo, useState } from 'react';
import { fullEquationsOfReaction } from '@/core/graph';
import type { Reaction } from '@/core/schema';
import { EQUATION_AREA, EquationScheme } from '@/render/equation';
import { createDepictionBinding } from '@/render/svg';
import { usePanels } from '@/ui/state';
import { useInspectorEnv } from './env';

export function FullEquations(props: { readonly record: Reaction }) {
  const env = useInspectorEnv();
  const { record } = props;
  const [open, setOpen] = useState(false);
  const { ports } = env;
  const equations = useMemo(() => fullEquationsOfReaction(env.state, ports.indexes.current(), record), [env, ports, record]);
  const binding = useMemo(() => (ports.depictions === undefined ? undefined : createDepictionBinding(ports.depictions, ports.timers, EQUATION_AREA)), [ports]);
  const names = usePanels(ports.ui.panels, (state) => state.equationNames);
  if (equations.length === 0) return null;
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Show full equation</summary>
      {open ? (
        <ul aria-label="Full equation">
          {equations.map((equation, index) => {
            const label = equations.length > 1 ? (record.outcomes[index]?.label ?? `Outcome ${index + 1}`) : undefined;
            return (
              <li key={equation.outcomeId}>
                <EquationScheme
                  equation={equation}
                  binding={binding}
                  timers={ports.timers}
                  facts={ports.facts}
                  names={names}
                  {...(index === 0 ? { onNamesChange: ports.ui.panels.getState().setEquationNames } : {})}
                  {...(label === undefined ? {} : { label })}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </details>
  );
}
