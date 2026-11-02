/**
 * The steps of one mechanism variant (step 7.4 E): a numbered list; each step has its heading ("Step 1 · title" or the step kinds), the kinds as
 * words, the description, a row of its species (drawn small when the step carries a structure, else the label or the record's name) with a small
 * role word under each, "slow step" and "⇌ reversible" marks, the stereochemical event and the note. Curved arrows are NOT drawn here (Phase 8).
 */
import type { ReactNode } from 'react';
import type { StepView, VariantView } from '@/core/mechanisms';
import { termRepresentationOf } from '@/core/graph';
import { Runs, useFactsInput } from '@/render/equation';
import { formulaRuns } from '@/render/scene';
import { studyPageStyles as page } from '@/ui/study-page';
import type { MechanismPorts } from './contracts';
import { stepHeading } from './model';
import styles from './mechanism-view.module.css';

type StepSpecies = StepView['species'][number];

/**
 * One species of a step. The SAME rule the equation's terms use (`termRepresentationOf`, 7.6 A2): a small molecule or ion (no carbon, or one
 * carbon and at most 3 heavy atoms) is written as its label in formula typography at the normal text size, never as a huge drawing; a larger
 * one stays drawn. While the engine has not answered the label is shown; if it cannot say, the drawing is kept (nothing is guessed).
 */
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
            <Runs runs={formulaRuns(formula, charge)} />
          </span>
        </span>
      ) : pending ? (
        <span className={styles.speciesBox} aria-hidden="true" />
      ) : null}
      {label === undefined ? null : <span className={styles.speciesName}>{label}</span>}
    </>
  );
}

function Step(props: { readonly ports: MechanismPorts; readonly step: StepView }) {
  const { ports, step } = props;
  return (
    <li className={styles.step} data-step={step.number}>
      <h4 className={styles.stepHeading}>{stepHeading(step)}</h4>
      <p className={styles.marks}>
        {step.title !== undefined && step.title !== '' && step.kinds.length > 0 ? <span>{step.kinds.join(', ')}</span> : null}
        {step.rateDetermining ? <span className={styles.mark}>slow step</span> : null}
        {step.reversible ? <span className={styles.mark}>⇌ reversible</span> : null}
      </p>
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
    </li>
  );
}

export function VariantSteps(props: { readonly ports: MechanismPorts; readonly variant: VariantView; readonly heading: boolean }): ReactNode {
  const { ports, variant } = props;
  return (
    <section className={page.section} aria-label={props.heading ? variant.label : 'Steps'} data-variant-id={variant.id}>
      {props.heading ? <h3 className={page.sectionHeading}>{variant.label}</h3> : null}
      {variant.applicability === undefined ? null : <div>{ports.renderRichText(variant.applicability)}</div>}
      {variant.steps.length === 0 ? <p className={page.muted}>No step is written for this pathway yet.</p> : (
        <ol className={styles.steps} aria-label={`Steps${props.heading ? ` of ${variant.label}` : ''}`}>
          {variant.steps.map((step) => (
            <Step key={step.id} ports={ports} step={step} />
          ))}
        </ol>
      )}
      {variant.rateLaw === undefined ? null : <p className={page.facts} data-rate-law="">{`Rate law: ${variant.rateLaw}`}</p>}
      {variant.note === undefined ? null : <div>{ports.renderRichText(variant.note)}</div>}
    </section>
  );
}
