/**
 * A classification list (step 6.6a, decision C3): the concepts a reaction or mechanism is claimed to be (reaction types, mechanism classes),
 * each with its certainty. Summary chips "SN2 (definite)"; a concept is added through the generic picker with the certainty ABSENT, and the
 * select says "Choose certainty" until it is chosen (the schema's L1 refuses Save until then). No chemistry, no defaults.
 */
import { Button } from '@/ui/primitives';
import { addClassification, CERTAINTY_WORDS, classificationLine, classificationsOf, removeClassification, setCertainty, type ClassificationField } from './classification-model';
import { RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';

export function ClassificationSection(props: SectionProps & { readonly field: ClassificationField; readonly label: string; readonly findLabel: string; readonly picker: RecordPickerPort | undefined }) {
  const { field, picker } = props;
  const items = classificationsOf(props.draft, field);
  const locked = props.unavailable;
  return (
    <div className={styles.list} role="group" aria-label={props.label}>
      <h4>{props.label}</h4>
      {items.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul className={styles.chips} aria-label={`${props.label} list`} data-field-path={field}>
        {items.map((item, index) => {
          const name = picker?.describe('concept', item.conceptId)?.name ?? item.conceptId;
          const path = `${field}[${index}].certainty`;
          return (
            <li key={item.conceptId} className={styles.chip} data-phone={props.phone === true ? 'true' : undefined}>
              <span>{classificationLine(name, item.certainty)}</span>
              <select aria-label={`Certainty of ${name}`} value={item.certainty} disabled={locked !== undefined} aria-invalid={props.invalid?.has(path) === true ? true : undefined} data-field-path={path} onChange={(event) => props.onEdit(setCertainty(field, index, event.target.value), path)}>
                <option value="">Choose certainty</option>
                {(Object.keys(CERTAINTY_WORDS) as (keyof typeof CERTAINTY_WORDS)[]).map((certainty) => (
                  <option key={certainty} value={certainty}>
                    {CERTAINTY_WORDS[certainty]}
                  </option>
                ))}
              </select>
              <Button aria-label={`Remove ${name}`} {...(locked === undefined ? { onClick: () => props.onEdit(removeClassification(field, index)) } : { unavailable: locked })}>
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
      <RecordPicker id={`classification-${field}`} label={props.findLabel} kinds={['concept']} port={picker} noun="concept" resultsLabel="Concepts found" unavailable={locked} isListed={(choice) => items.some((item) => item.conceptId === choice.id)} onPick={(choice) => props.onEdit(addClassification(field, choice.id))} />
    </div>
  );
}
