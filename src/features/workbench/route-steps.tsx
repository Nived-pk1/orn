/**
 * The Steps section of the route editor (7.2b C1): one summary line per step, "1. <reaction> · <outcome words> · <variant label>", with
 * Edit, Up, Down and Remove (Remove asks first). An open step shows the reaction (the picker over reactions), its outcome (that reaction's
 * outcomes in the card's words; "Any outcome" is allowed by the schema), its condition variant (that reaction's; "No variant" allowed) and
 * "Takes its input from": a checkbox per EARLIER step, none ticked for a new step. Nothing is guessed; RTE-001 to RTE-004 speak at Save.
 */
import { useState } from 'react';
import { Button } from '@/ui/primitives';
import { addStep, moveStep, removeStep, routeViewOf, setStepOutcome, setStepReaction, setStepVariant, toggleInput, type StepView } from './route-model';
import { choiceLine, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';
import stepStyles from './route-steps.module.css';

export interface RouteStepsProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
  readonly newId: (prefix: string) => string;
}

function summaryOf(step: StepView, index: number, picker: RecordPickerPort | undefined): string {
  if (step.reactionId === '') return `${index + 1}. Choose a reaction`;
  const name = picker?.describe('reaction', step.reactionId)?.name ?? step.reactionId;
  const parts = picker?.partsOfReaction?.(step.reactionId);
  const outcome = step.outcomeId === '' ? 'any outcome' : (parts?.outcomes.find((o) => o.id === step.outcomeId)?.words ?? step.outcomeId);
  const variant = step.conditionVariantId === '' ? 'no variant' : (parts?.variants.find((v) => v.id === step.conditionVariantId)?.label ?? step.conditionVariantId);
  return `${index + 1}. ${name} · ${outcome} · ${variant}`;
}

function OpenStep(props: RouteStepsProps & { readonly step: StepView; readonly index: number; readonly earlier: readonly { readonly step: StepView; readonly number: number }[] }) {
  const { step, index, picker, onEdit } = props;
  const locked = props.unavailable;
  const parts = step.reactionId === '' ? undefined : picker?.partsOfReaction?.(step.reactionId);
  const bad = (field: string): true | undefined => (props.invalid?.has(`steps[${index}].${field}`) === true ? true : undefined);
  const n = index + 1;
  return (
    <div className={styles.field} data-step-editor={n}>
      <p>{step.reactionId === '' ? 'No reaction chosen yet.' : choiceLine(picker?.describe('reaction', step.reactionId), step.reactionId)}</p>
      <RecordPicker
        id={`route-step-${n}-reaction`}
        label={`Find the reaction of step ${n} by name`}
        kinds={['reaction']}
        port={picker}
        noun="reaction"
        resultsLabel={`Reactions found for step ${n}`}
        unavailable={locked}
        isListed={(choice) => choice.id === step.reactionId}
        onPick={(choice) => onEdit(setStepReaction(index, choice.id))}
      />
      <label htmlFor={`route-step-${n}-outcome`}>{`Outcome of step ${n}`}</label>
      <select id={`route-step-${n}-outcome`} value={step.outcomeId} disabled={locked !== undefined || step.reactionId === ''} aria-invalid={bad('outcomeId')} data-field-path={`steps[${index}].outcomeId`} onChange={(event) => onEdit(setStepOutcome(index, event.target.value))}>
        <option value="">Any outcome</option>
        {(parts?.outcomes ?? []).map((outcome) => (
          <option key={outcome.id} value={outcome.id}>
            {outcome.words}
          </option>
        ))}
      </select>
      <label htmlFor={`route-step-${n}-variant`}>{`Conditions of step ${n}`}</label>
      <select id={`route-step-${n}-variant`} value={step.conditionVariantId} disabled={locked !== undefined || step.reactionId === ''} aria-invalid={bad('conditionVariantId')} data-field-path={`steps[${index}].conditionVariantId`} onChange={(event) => onEdit(setStepVariant(index, event.target.value))}>
        <option value="">No variant</option>
        {(parts?.variants ?? []).map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
          </option>
        ))}
      </select>
      {parts !== undefined && parts.variants.length > 0 && step.conditionVariantId === '' ? <p className={styles.hint}>Choose the condition variant.</p> : null}
      <fieldset>
        <legend>{`Takes its input from (step ${n})`}</legend>
        {props.earlier.length === 0 ? <p className={styles.hint}>There is no earlier step: this step starts from available materials.</p> : null}
        {props.earlier.map(({ step: from, number }) => (
          <label key={from.id}>
            <input type="checkbox" checked={step.inputFromStepIds.includes(from.id)} disabled={locked !== undefined} data-field-path={`steps[${index}].inputFromStepIds`} onChange={(event) => onEdit(toggleInput(index, from.id, event.target.checked))} />
            {` Step ${number}`}
          </label>
        ))}
        <p className={styles.hint}>Tick the step whose product this step uses; tick none for a starting material.</p>
      </fieldset>
    </div>
  );
}

export function RouteStepsSection(props: RouteStepsProps) {
  const view = routeViewOf(props.draft);
  const locked = props.unavailable;
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  return (
    <div>
      {view.steps.length === 0 ? <p className={styles.hint}>No steps yet (RTE-003).</p> : null}
      <ol aria-label="Steps" className={styles.chips}>
        {view.steps.map((step, index) => (
          <li key={step.id} className={props.phone === true ? `${styles.row} ${styles.rowPhone}` : styles.row} data-step-id={step.id}>
            <span className={stepStyles.stepSummary}>{summaryOf(step, index, props.picker)}</span>
            <div className={props.phone === true ? `${stepStyles.stepActions} ${stepStyles.stepActionsPhone}` : stepStyles.stepActions} data-asking={asking === step.id ? 'true' : undefined}>
            <Button aria-label={`Edit step ${index + 1}`} aria-expanded={open === step.id} onClick={() => setOpen(open === step.id ? null : step.id)}>
              {open === step.id ? 'Close' : 'Edit'}
            </Button>
            <Button aria-label={`Move step ${index + 1} up`} {...(locked === undefined ? { onClick: () => props.onEdit(moveStep(index, -1)) } : { unavailable: locked })}>
              Up
            </Button>
            <Button aria-label={`Move step ${index + 1} down`} {...(locked === undefined ? { onClick: () => props.onEdit(moveStep(index, 1)) } : { unavailable: locked })}>
              Down
            </Button>
            {asking === step.id ? (
              <span role="group" aria-label={`Remove step ${index + 1}?`}>
                <span>{`Remove step ${index + 1}?`}</span>{' '}
                <Button
                  aria-label={`Confirm remove step ${index + 1}`}
                  onClick={() => {
                    props.onEdit(removeStep(index));
                    setAsking(null);
                  }}
                >
                  Remove
                </Button>{' '}
                <Button onClick={() => setAsking(null)}>Keep</Button>
              </span>
            ) : (
              <Button aria-label={`Remove step ${index + 1}`} {...(locked === undefined ? { onClick: () => setAsking(step.id) } : { unavailable: locked })}>
                Remove
              </Button>
            )}
            </div>
            {open !== step.id ? null : <OpenStep {...props} step={step} index={index} earlier={view.steps.slice(0, index).map((from, i) => ({ step: from, number: i + 1 }))} />}
          </li>
        ))}
      </ol>
      <Button
        {...(locked === undefined
          ? {
              onClick: () => {
                props.onEdit(addStep(props.newId));
                setOpen(null);
              },
            }
          : { unavailable: locked })}
      >
        Add a step
      </Button>
    </div>
  );
}
