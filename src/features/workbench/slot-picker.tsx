/**
 * An empty slot of a specific reaction started from a generic one (step 6.7a decision C3): "Choose a species of <class>" and a picker for
 * species whose members of that class come first; every other species stays choosable under "Other species" (the existing membership
 * checks, CHEM-007, speak live once one is chosen). Choosing fills the slot (the recipes in `slot-model.ts`). No chemistry here: the port
 * says which species are assigned to the class.
 */
import type { DraftRecipe } from '@/core/editing';
import { RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import styles from './editor.module.css';

export interface SlotPickerProps {
  readonly id: string;
  /** The class the slot stands for. */
  readonly classId: string;
  readonly picker: RecordPickerPort | undefined;
  readonly unavailable?: string | undefined;
  /** The recipe that fills the slot with the species chosen. */
  readonly fill: (speciesId: string) => DraftRecipe;
  readonly onEdit: (recipe: DraftRecipe, path?: string) => void;
}

export function SlotPicker(props: SlotPickerProps) {
  const className = props.picker?.describe('class', props.classId)?.name ?? props.classId;
  return (
    <div className={styles.field} data-slot="">
      <p className={styles.hint}>{`Choose a species of ${className}`}</p>
      <RecordPicker
        id={props.id}
        label={`Find a species of ${className}`}
        kinds={['species']}
        port={props.picker}
        noun="species"
        resultsLabel={`Species of ${className}`}
        otherLabel="Other species"
        preferred={(choice) => props.picker?.memberOf?.(props.classId, choice.id) === true}
        unavailable={props.unavailable}
        isListed={() => false}
        onPick={(choice) => props.onEdit(props.fill(choice.id))}
      />
    </div>
  );
}
