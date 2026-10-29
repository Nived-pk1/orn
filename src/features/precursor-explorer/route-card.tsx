/**
 * One route (step 7.2a D4, D5): a found one or a stored one drawn the same way, read-only. A heading ("3 steps from Ethanol", with the
 * stored route's name first), then numbered steps: "1. Ethanol → Ethanal", the reaction (a link to the inspector), the text on the arrow,
 * the step's warnings in words and "Show the reaction", which expands that step's card. Nothing here edits or saves a route.
 */
import { useState, type ReactNode } from 'react';
import { Runs } from '@/render/equation';
import { partsToRuns } from '@/render/scene';
import type { PrecursorPorts } from './contracts';
import type { RouteView, StepView } from './model';
import styles from './precursors-view.module.css';

function Step(props: { readonly step: StepView; readonly ports: Pick<PrecursorPorts, 'select' | 'renderCard'>; readonly selected: string | null }) {
  const { step, ports } = props;
  const [open, setOpen] = useState(false);
  return (
    <li className={styles.step} data-step={step.n}>
      <span className={styles.stepLine} data-line="title">{`${step.n}. ${step.from} → ${step.to}`}</span>
      <span className={styles.stepReaction} data-line="reaction">
        <button type="button" className={styles.link} onClick={() => ports.select(step.reactionId)}>
          {step.reactionName}
        </button>
        <button type="button" className={styles.showCard} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Show the reaction
        </button>
      </span>
      {step.arrowAbove.length + step.arrowBelow.length === 0 ? null : (
        <span className={styles.arrow} data-line="conditions">
          <Runs runs={partsToRuns(step.arrowAbove)} />
          {step.arrowAbove.length > 0 && step.arrowBelow.length > 0 ? '; ' : null}
          <Runs runs={partsToRuns(step.arrowBelow)} />
        </span>
      )}
      {step.warnings.map((words) => (
        <span key={words} className={styles.warning}>
          {words}
        </span>
      ))}
      {open ? <div className={styles.stepCard}>{ports.renderCard({ reactionId: step.reactionId, selected: props.selected === step.reactionId, onSelect: ports.select, fallback: (reason): ReactNode => <p className={styles.muted}>{reason}</p> })}</div> : null}
    </li>
  );
}

export function RouteCard(props: { readonly route: RouteView; readonly ports: Pick<PrecursorPorts, 'select' | 'renderCard'>; readonly selected: string | null }) {
  const { route } = props;
  return (
    <li className={styles.route} data-route={route.key}>
      <h4 className={styles.routeName}>{route.name ?? route.heading}</h4>
      {route.name === undefined ? null : <p className={styles.routeHeading}>{route.heading}</p>}
      <ol className={styles.steps} aria-label={route.name === undefined ? 'Steps' : `Steps of ${route.name}`}>
        {route.steps.map((step) => (
          <Step key={step.n} step={step} ports={props.ports} selected={props.selected} />
        ))}
      </ol>
    </li>
  );
}
