/**
 * One route (step 7.2a D4, D5): a found one or a stored one drawn the same way, read-only. A heading ("3 steps from Ethanol", with the
 * stored route's name first), then numbered steps: "1. Ethanol → Ethanal", the reaction (a link to the inspector), the text on the arrow,
 * the step's warnings in words and "Show the reaction", which expands that step's card. Nothing here edits or saves a route.
 */
import { useState, type ReactNode } from 'react';
import type { PrecursorPorts } from './contracts';
import type { RouteView, StepView } from './model';
import styles from './precursors-view.module.css';

function Step(props: { readonly step: StepView; readonly ports: Pick<PrecursorPorts, 'select' | 'renderCard'>; readonly selected: string | null }) {
  const { step, ports } = props;
  const [open, setOpen] = useState(false);
  return (
    <li className={styles.step} data-step={step.n}>
      <span className={styles.stepLine}>{`${step.n}. ${step.from} → ${step.to}`}</span>
      <button type="button" className={styles.link} onClick={() => ports.select(step.reactionId)}>
        {step.reactionName}
      </button>
      {step.arrow === '' ? null : <span className={styles.arrow}>{step.arrow}</span>}
      {step.warnings.map((words) => (
        <span key={words} className={styles.warning}>
          {words}
        </span>
      ))}
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Show the reaction
      </button>
      {open ? <div className={styles.stepCard}>{ports.renderCard({ reactionId: step.reactionId, selected: props.selected === step.reactionId, onSelect: ports.select, fallback: (reason): ReactNode => <p className={styles.muted}>{reason}</p> })}</div> : null}
    </li>
  );
}

export function RouteCard(props: { readonly route: RouteView; readonly ports: Pick<PrecursorPorts, 'select' | 'renderCard'>; readonly selected: string | null }) {
  const { route } = props;
  return (
    <li className={styles.route} data-route={route.key}>
      {route.name === undefined ? null : <h4 className={styles.routeName}>{route.name}</h4>}
      <p className={styles.routeHeading}>{route.heading}</p>
      <ol className={styles.steps} aria-label={route.name === undefined ? 'Steps' : `Steps of ${route.name}`}>
        {route.steps.map((step) => (
          <Step key={step.n} step={step} ports={props.ports} selected={props.selected} />
        ))}
      </ol>
    </li>
  );
}
