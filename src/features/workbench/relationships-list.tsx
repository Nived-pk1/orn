/**
 * The read-only "Relationships" list every record editor shows (step 6.6b part 4, decision N5): the stored relationships this record is an
 * end of, in words, each with a way to open it in the inspector (the editor closes and the draft is kept). Derived through the port;
 * nothing is edited here (a relationship is edited in its own editor).
 */
import type { RecordRef } from '@/core/schema';
import { Button } from '@/ui/primitives';
import type { RecordPickerPort } from './record-picker-contracts';
import styles from './editor.module.css';

export interface RelationshipsListProps {
  readonly kind: string;
  readonly id: string;
  readonly picker?: RecordPickerPort | undefined;
  readonly openRecord?: ((ref: RecordRef) => void) | undefined;
}

export function RelationshipsList(props: RelationshipsListProps) {
  const lines = props.picker?.relationshipsOf?.({ kind: props.kind, id: props.id }) ?? [];
  if (lines.length === 0) return <p className={styles.hint}>No relationships.</p>;
  return (
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
  );
}
