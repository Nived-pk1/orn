/**
 * "Show full equation" at L1 of a reaction (equation step, part 5; before: step 5.9a review, follow-up b): a disclosure with one textbook
 * scheme per GROUP of outcomes (`render/equation`; the outcomes that share their condition-variant set are one scheme): every reactant with its coefficient, an arrow with the reagents over it and the conditions
 * under it, every product with the card's selectivity word. Which terms are drawn and which are formulas is decided by the core from the
 * chem facts. The "Names" switch (one setting, saved with the panels) is in the first scheme; the text is always a React child, never markup.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { fullEquationsOfReaction } from '@/core/graph';
import type { Reaction } from '@/core/schema';
import { EQUATION_AREA, EquationScheme, fitHero, type HeroFit } from '@/render/equation';
import { createDepictionBinding } from '@/render/svg';
import { usePanels } from '@/ui/state';
import { useInspectorEnv } from './env';
import styles from './inspector.module.css';

function useEquations(record: Reaction) {
  const env = useInspectorEnv();
  const { ports } = env;
  const equations = useMemo(() => fullEquationsOfReaction(env.state, ports.indexes.current(), record), [env, ports, record]);
  const binding = useMemo(() => (ports.depictions === undefined ? undefined : createDepictionBinding(ports.depictions, ports.timers, EQUATION_AREA)), [ports]);
  const names = usePanels(ports.ui.panels, (state) => state.equationNames);
  return { ports, equations, binding, names };
}

/**
 * The picture first (step 8.1 hero): the reaction's first full equation. It NEVER wraps (review decision 0): one row when it fits, the row
 * scaled down while its drawings stay 80 px tall, else the vertical layout of the phone card; `compact` (the sheet's peek) is one row at most
 * 120 px high, or the one-line text when it cannot be read that way. `fitHero` decides; this measures and draws.
 */
export function HeroEquation(props: { readonly record: Reaction; readonly compact?: boolean }) {
  const { ports, equations, binding, names } = useEquations(props.record);
  const first = equations[0];
  const box = useRef<HTMLDivElement>(null);
  const natural = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<HeroFit>({ mode: 'row', scale: 1 });
  const [height, setHeight] = useState(0);
  const compact = props.compact === true;
  const reactants = first?.reactants.length ?? 0;
  const products = first?.products.length ?? 0;
  const mode = fit.mode;
  useLayoutEffect(() => {
    // the nodes are read again at every measurement and observed again when the mode swaps them (a stale node measures 0 and flips the mode back)
    const measure = (): void => {
      const outer = box.current;
      const row = natural.current;
      if (outer === null || row === null || row.offsetWidth === 0) return; // hidden (the other sheet height): measured again when it is shown
      const scaleNow = row.getBoundingClientRect().height / (row.offsetHeight || 1) || 1;
      const drawings = [...row.querySelectorAll('img')].map((img) => img.getBoundingClientRect().height / scaleNow);
      const next = fitHero({ available: outer.clientWidth, width: row.offsetWidth, height: row.offsetHeight, drawingHeight: Math.max(0, ...drawings) }, compact ? { peek: true, reactants, products } : undefined);
      setHeight(row.offsetHeight);
      setFit((before) => (before.mode === next.mode && (before.mode !== 'row' || (next.mode === 'row' && Math.abs(before.scale - next.scale) < 0.005)) ? before : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    if (box.current !== null) observer.observe(box.current);
    if (natural.current !== null) observer.observe(natural.current);
    return () => observer.disconnect();
  }, [compact, reactants, products, first, mode]);
  if (first === undefined) return null;
  const scheme = (layout: 'row' | 'stacked') => <EquationScheme equation={first} binding={binding} timers={ports.timers} facts={ports.facts} names={names} label="Equation of this reaction" layout={layout} nowrap={layout === 'row'} />;
  const scale = fit.mode === 'row' ? fit.scale : 1;
  return (
    <div ref={box} data-hero-equation="" data-fit={fit.mode} {...(compact ? { 'data-compact': '' } : {})} style={{ width: '100%', minWidth: 0, position: 'relative', overflow: 'hidden' }}>
      {fit.mode === 'row' ? (
        <div style={{ height: height * scale, overflow: 'hidden' }}>
          <div ref={natural} style={{ width: 'max-content', transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: '0 0' }}>
            {scheme('row')}
          </div>
        </div>
      ) : (
        <>
          {/* the row at its natural size, kept (hidden) so a wider box can bring the row back */}
          <div ref={natural} aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none', height: 0, overflow: 'hidden', width: 'max-content' }}>
            {scheme('row')}
          </div>
          {fit.mode === 'stacked' ? scheme('stacked') : <p data-hero-text="" style={{ margin: 0, overflowWrap: 'anywhere' }}>{first.text}</p>}
        </>
      )}
    </div>
  );
}

export function FullEquations(props: { readonly record: Reaction }) {
  const { record } = props;
  const [open, setOpen] = useState(false);
  const { ports, equations, binding, names } = useEquations(record);
  if (equations.length === 0) return null;
  return (
    <details className={styles.equationPanel} data-equation-panel="" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Show full equation</summary>
      {open ? (
        <ul aria-label="Full equation">
          {equations.map((equation, index) => {
            // one scheme per GROUP of outcomes (the same condition-variant set); several groups are told apart by their outcomes' labels
            const named = equation.outcomeIds.flatMap((id) => record.outcomes.find((outcome) => outcome.id === id)?.label ?? []);
            const label = equations.length > 1 ? (named.length > 0 ? named.join(' and ') : `Outcome ${index + 1}`) : undefined;
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
