/**
 * The steps of one mechanism variant (step 7.4 E): a numbered list; each step has its heading ("Step 1 · title" or the step kinds), the kinds as
 * words, the description, a row of its species (drawn small when the step carries a structure, else the label or the record's name) with a small
 * role word under each, "slow step" and "⇌ reversible" marks, the stereochemical event and the note. Curved arrows are NOT drawn here (Phase 8).
 */
import { useState, type ReactNode } from 'react';
import type { StepView, VariantView } from '@/core/mechanisms';
import { termRepresentationOf } from '@/core/graph';
import { Runs, useFactsInput } from '@/render/equation';
import { StepDrawing, type DrawableStep, type DrawingStatus } from '@/render/mechanism';
import { useLayoutMode } from '@/ui/hooks';
import { formulaRuns } from '@/render/scene';
import { studyPageStyles as page } from '@/ui/study-page';
import type { MechanismPorts } from './contracts';
import { stepHeading } from './model';
import styles from './mechanism-view.module.css';
import { EmptyState } from '@/ui/primitives';

type StepSpecies = StepView['species'][number];

/**
 * One species of a step. The SAME rule the equation's terms use (`termRepresentationOf`, 7.6 A2): a small molecule or ion (no carbon, or one
 * carbon and at most 3 heavy atoms) is written as its label in formula typography at the normal text size, never as a huge drawing; a larger
 * one stays drawn. While the engine has not answered the label is shown; if it cannot say, the drawing is kept (nothing is guessed).
 */
/** The engine's formula has no charge ("HO"): the charge is written after it ("HO-", "Cu2+"), and the typography makes it a superscript. */
const withCharge = (formula: string, charge: number | undefined): string =>
  charge === undefined || charge === 0 ? formula : `${formula}${Math.abs(charge) === 1 ? '' : Math.abs(charge)}${charge > 0 ? '+' : '-'}`;

function Species(props: { readonly ports: MechanismPorts; readonly species: StepSpecies }) {
  const { ports, species } = props;
  const { structure, label } = species;
  const facts = useFactsInput(ports.facts, structure, structure !== undefined && ports.facts !== undefined);
  // the engine's formula and counts decide; when it cannot say (or gave no formula) the drawing is kept: nothing is guessed
  const formula = facts.state === 'ready' ? facts.formula : undefined;
  const representation =
    structure === undefined || formula === undefined ? undefined : termRepresentationOf({ kind: 'species', name: label ?? '', structure, formula, ...(facts.state === 'ready' && facts.charge !== undefined ? { charge: facts.charge } : {}) }, facts);
  const asFormula = representation?.kind === 'formula';
  const pending = structure !== undefined && facts.state === 'pending';
  const drawn = structure !== undefined && !asFormula && !pending;
  const charge = facts.state === 'ready' ? facts.charge : undefined;
  return (
    <>
      {drawn ? <span className={styles.drawing}>{ports.renderStructure(structure, label ?? species.role)}</span> : null}
      {asFormula && formula !== undefined ? (
        <span className={styles.speciesBox} data-species-box="">
          <span className={styles.speciesFormula} data-species-formula="">
            <Runs runs={formulaRuns(withCharge(formula, charge), charge)} />
          </span>
        </span>
      ) : pending ? (
        <span className={styles.speciesBox} aria-hidden="true" />
      ) : null}
      {label === undefined ? null : <span className={styles.speciesName}>{label}</span>}
    </>
  );
}

/** What a drawing needs of a stored step (the same shape the Studio editor gives for its draft). */
const drawableOf = (step: StepView): DrawableStep => ({
  number: step.number,
  reversible: step.reversible,
  electronMovements: step.electronMovements,
  species: step.species.map((one, i) => ({
    role: step.roleKeys[i] ?? 'reactant',
    ...(one.label === undefined ? {} : { label: one.label }),
    ...(one.structure === undefined ? {} : { structure: one.structure }),
  })),
});

/** More steps than this draw only when they come near the screen (8.5 D7). */
export const LAZY_DRAWING_STEPS = 6;

function Step(props: { readonly ports: MechanismPorts; readonly step: StepView; readonly lazy: boolean }) {
  const { ports, step } = props;
  const mode = useLayoutMode();
  const [status, setStatus] = useState<DrawingStatus>('loading');
  const [chosen, setChosen] = useState<boolean | undefined>(undefined);
  const drawing = ports.drawing;
  // the details are open until there is a drawing above them (and always open when the step cannot be drawn); a choice of the reader stays
  const open = chosen ?? status !== 'ready';
  const details = (
    <>
      {step.description === undefined ? null : <div>{ports.renderRichText(step.description)}</div>}
      {step.species.length === 0 ? null : (
        <ul className={styles.species} aria-label={`Species of step ${step.number}`}>
          {step.species.map((one, i) => (
            <li key={`${one.role}-${i}`} className={styles.one}>
              <Species ports={ports} species={one} />
              <span className={styles.role}>{one.role}</span>
            </li>
          ))}
        </ul>
      )}
      {step.stereochemicalEvent === undefined ? null : <p className={page.facts}>{`Stereochemistry: ${step.stereochemicalEvent}`}</p>}
      {step.note === undefined ? null : <div>{ports.renderRichText(step.note)}</div>}
    </>
  );
  return (
    <li className={styles.step} data-step={step.number}>
      <h4 className={styles.stepHeading}>{stepHeading(step)}</h4>
      <p className={styles.marks}>
        {step.title !== undefined && step.title !== '' && step.kinds.length > 0 ? <span>{step.kinds.join(', ')}</span> : null}
        {step.rateDetermining ? <span className={styles.mark}>slow step</span> : null}
        {step.reversible ? <span className={styles.mark}>⇌ reversible</span> : null}
      </p>
      {drawing === undefined ? (
        details
      ) : (
        <>
          <StepDrawing step={drawableOf(step)} port={drawing} orientation={mode === 'phone' ? 'column' : 'row'} lazy={props.lazy} onStatus={setStatus} />
          <details className={styles.details} open={open} onToggle={(event) => event.currentTarget.open !== open && setChosen(event.currentTarget.open)}>
            <summary className={styles.summary}>Step details</summary>
            {details}
          </details>
        </>
      )}
    </li>
  );
}

export function VariantSteps(props: { readonly ports: MechanismPorts; readonly variant: VariantView; readonly heading: boolean }): ReactNode {
  const { ports, variant } = props;
  return (
    <section className={page.section} aria-label={props.heading ? variant.label : 'Steps'} data-variant-id={variant.id}>
      {props.heading ? <h3 className={page.sectionHeading}>{variant.label}</h3> : null}
      {variant.applicability === undefined ? null : <div>{ports.renderRichText(variant.applicability)}</div>}
      {variant.steps.length === 0 ? <EmptyState inline>No step is written for this pathway yet.</EmptyState> : (
        <ol className={styles.steps} aria-label={`Steps${props.heading ? ` of ${variant.label}` : ''}`}>
          {variant.steps.map((step) => (
            <Step key={step.id} ports={ports} step={step} lazy={variant.steps.length > LAZY_DRAWING_STEPS} />
          ))}
        </ol>
      )}
      {variant.rateLaw === undefined ? null : <p className={page.facts} data-rate-law="">{`Rate law: ${variant.rateLaw}`}</p>}
      {variant.note === undefined ? null : <div>{ports.renderRichText(variant.note)}</div>}
    </section>
  );
}
