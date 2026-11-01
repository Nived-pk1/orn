/**
 * The steps of one mechanism variant (step 7.4 E): a numbered list; each step has its heading ("Step 1 · title" or the step kinds), the kinds as
 * words, the description, a row of its species (drawn small when the step carries a structure, else the label or the record's name) with a small
 * role word under each, "slow step" and "⇌ reversible" marks, the stereochemical event and the note. Curved arrows are NOT drawn here (Phase 8).
 */
import type { ReactNode } from 'react';
import type { StepView, VariantView } from '@/core/mechanisms';
import { studyPageStyles as page } from '@/ui/study-page';
import type { MechanismPorts } from './contracts';
import { stepHeading } from './model';
import styles from './mechanism-view.module.css';

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
              {one.structure === undefined ? null : <span className={styles.drawing}>{ports.renderStructure(one.structure, one.label ?? one.role)}</span>}
              {one.label === undefined ? null : <span className={styles.speciesName}>{one.label}</span>}
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
