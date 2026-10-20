/**
 * A three-way choice for a step's optional yes/no claim (step 6.5a review F1): Not stated (the field is ABSENT) / Yes (true) / No (false).
 * "No" is a chemistry claim, so it is never what an untouched field means. Compact segmented radios; 44 px high on a phone.
 */
import type { StepFlag } from './step-model';
import styles from './step-fields.module.css';

const CHOICES: readonly { readonly label: string; readonly value: boolean | undefined }[] = [
  { label: 'Not stated', value: undefined },
  { label: 'Yes', value: true },
  { label: 'No', value: false },
];

export interface TriChoiceProps {
  readonly legend: string;
  readonly flag: StepFlag;
  readonly idBase: string;
  readonly path: string;
  readonly value: boolean | undefined;
  readonly disabled: boolean;
  readonly phone?: boolean | undefined;
  readonly onChange: (value: boolean | undefined) => void;
}

export function TriChoice(props: TriChoiceProps) {
  return (
    <fieldset className={`${styles.tri} ${props.phone === true ? styles.triPhone : ''}`} aria-label={props.legend} data-field-path={props.path}>
      <legend>{props.legend}</legend>
      <div className={styles.segments}>
        {CHOICES.map((choice) => (
          <label key={choice.label} className={styles.segment}>
            <input type="radio" name={`${props.idBase}-${props.flag}`} checked={props.value === choice.value} disabled={props.disabled} onChange={() => props.onChange(choice.value)} />
            <span>{choice.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
