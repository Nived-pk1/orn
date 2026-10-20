/**
 * The reaction editor's Mechanism links section (step 6.5a decision D5): the mechanisms the reaction links, each with Remove, and a picker
 * (a mechanism found by name). Removing a mechanism an outcome of THIS draft names is refused in words ("Outcomes 1 and 2 use this mechanism;
 * change those links first"). A reaction links at most 16 mechanisms (the schema's limit). Text only; the recipes decide.
 */
import { Button } from '@/ui/primitives';
import { addMechanismLink, linkedIdsOf, outcomeNumbersUsing, removeMechanismLink, usingWords } from './mechanism-link-model';
import { RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';

export const MAX_LINKED_MECHANISMS = 16;

export interface MechanismLinksProps extends SectionProps {
  readonly picker?: RecordPickerPort | undefined;
}

export function MechanismLinksSection(props: MechanismLinksProps) {
  const { onEdit, picker } = props;
  const locked = props.unavailable;
  const ids = linkedIdsOf(props.draft);
  const full = ids.length >= MAX_LINKED_MECHANISMS;
  return (
    <div>
      {ids.length === 0 ? <p className={styles.hint}>No mechanism is linked to this reaction.</p> : null}
      <ul className={styles.list} aria-label="Linked mechanisms" data-field-path="mechanismIds">
        {ids.map((id, index) => {
          const name = picker?.describe('mechanism', id)?.name ?? id;
          const refusal = usingWords(outcomeNumbersUsing(props.draft, id));
          return (
            <li key={id} className={styles.panel}>
              <span>{picker?.describe('mechanism', id) === undefined ? `${id} (not in this dataset)` : name}</span>{' '}
              <Button aria-label={`Remove link to ${name}`} {...(locked !== undefined ? { unavailable: locked } : refusal !== undefined ? { unavailable: refusal } : { onClick: () => onEdit(removeMechanismLink(index)) })}>
                Remove
              </Button>
              {refusal === undefined ? null : <p className={styles.hint}>{refusal}</p>}
            </li>
          );
        })}
      </ul>
      {full ? (
        <p className={styles.hint}>A reaction can link at most {MAX_LINKED_MECHANISMS} mechanisms.</p>
      ) : (
        <RecordPicker
          id="mechanism-link-search"
          label="Find the mechanism by name"
          kinds={['mechanism']}
          port={picker}
          noun="mechanism"
          resultsLabel="Mechanisms found"
          unavailable={locked}
          isListed={(choice) => ids.includes(choice.id)}
          onPick={(choice) => onEdit(addMechanismLink(choice.id))}
        />
      )}
    </div>
  );
}
