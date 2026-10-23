/**
 * The class editor's "Map family" section (step 6.6c part 4, M4): says whether the class is a family on the overview map and offers
 * "Make this a map family" (keeps the draft, closes the editor and opens a NEW map family with the class filled in) or "Edit map family".
 * Derived through the port; the family is its own record, edited in its own editor.
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { textField } from './curriculum-model';
import { useRemove } from './remove-context';
import type { RecordPickerPort } from './record-picker-contracts';
import styles from './editor.module.css';

export interface MapFamilySectionProps {
  readonly draft: unknown;
  readonly picker?: RecordPickerPort | undefined;
  readonly saved: boolean;
  readonly startNew?: ((kind: RecordKind, seed: Readonly<Record<string, unknown>>) => void) | undefined;
  readonly editRecord?: ((ref: RecordRef) => void) | undefined;
}

export function MapFamilySection(props: MapFamilySectionProps) {
  const id = textField(props.draft, 'id');
  const remove = useRemove();
  const familyId = props.picker?.mapFamilyOf?.(id);
  if (props.picker?.mapFamilyOf === undefined) return <p className={styles.hint}>Whether this class is a map family is not available here.</p>;
  if (familyId !== undefined) {
    return (
      <div>
        <p>This class is a map family.</p>
        <Button {...(props.editRecord === undefined ? { unavailable: 'not available here' } : { onClick: () => props.editRecord?.({ kind: 'navigator_anchor', id: familyId } as RecordRef) })}>Edit map family</Button>
        {remove === undefined ? null : <Button onClick={() => remove({ kind: 'navigator_anchor', id: familyId } as RecordRef)}>Remove from the map</Button>}
      </div>
    );
  }
  return (
    <div>
      <p>This class is not a map family.</p>
      <Button {...(props.startNew === undefined ? { unavailable: 'not available here' } : props.saved ? { onClick: () => props.startNew?.('navigator_anchor', { target: { kind: 'class', id } }) } : { unavailable: 'save the class first' })}>Make this a map family</Button>
      <p className={styles.hint}>A family is a box on the overview map. It is made in its own editor; the class itself does not change.</p>
    </div>
  );
}
