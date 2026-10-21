/**
 * The read-only "Relationships" list every record editor shows (step 6.6b part 4, decision N5): the stored relationships this record is an
 * end of, in words, each with a way to open it in the inspector (the editor closes and the draft is kept). Derived through the port;
 * nothing is edited here (a relationship is edited in its own editor).
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import type { RecordPickerPort } from './record-picker-contracts';
import styles from './editor.module.css';

export interface RelationshipsListProps {
  readonly kind: string;
  readonly id: string;
  readonly picker?: RecordPickerPort | undefined;
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
  /** The record is saved (a relationship can point at it). */
  readonly saved?: boolean | undefined;
  /** Closes the editor (the draft is kept) and opens a NEW relationship with this record as the first end. */
  readonly startNew?: ((kind: RecordKind, seed: Readonly<Record<string, unknown>>) => void) | undefined;
}

export function RelationshipsList(props: RelationshipsListProps) {
  const lines = props.picker?.relationshipsOf?.({ kind: props.kind, id: props.id }) ?? [];
  const make = (
    <Button {...(props.startNew === undefined ? { unavailable: 'not available here' } : props.saved === true ? { onClick: () => props.startNew?.('relationship', { from: { kind: props.kind, id: props.id } }) } : { unavailable: 'save the record first' })}>New relationship from here</Button>
  );
  if (lines.length === 0) {
    return (
      <div>
        <p className={styles.hint}>No relationships.</p>
        {make}
      </div>
    );
  }
  return (
    <div>
    <ul aria-label="Relationships" className={styles.chips}>
      {lines.map((line) => (
        <li key={line.id} className={styles.chip}>
          <span>{line.words}</span>
          {props.openRecord === undefined ? null : (
            <Button aria-label={`Open ${line.words} in the inspector`} onClick={() => props.openRecord?.({ kind: 'relationship', id: line.id } as RecordRef)}>
              Open
            </Button>
          )}
        </li>
      ))}
    </ul>
    {make}
    </div>
  );
}
