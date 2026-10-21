/**
 * The record a topic mapping or an exam relevance is about (step 6.6c): chosen through the picker over the kinds the reference registry
 * allows (a route has no search yet, and the form says so), shown with Remove once chosen. Reports the choice as a recipe; decides nothing.
 */
import { refField, setRef, TARGET_KINDS } from './curriculum-model';
import { RecordList, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';

export function TargetField(props: SectionProps & { readonly picker?: RecordPickerPort | undefined }) {
  const target = refField(props.draft, 'target');
  const bad = props.invalid?.has('target') === true ? true : undefined;
  if (target !== undefined) {
    return (
      <div data-field-path="target" aria-invalid={bad}>
        <RecordList label="Target record" fieldPath="target" items={[{ kind: target.kind as never, id: target.id }]} port={props.picker} unavailable={props.unavailable} onRemove={() => props.onEdit(setRef('target', undefined))} />
      </div>
    );
  }
  return (
    <div data-field-path="target" aria-invalid={bad}>
      <RecordPicker
        id="curriculum-target-search"
        label="Find the target record by name"
        kinds={TARGET_KINDS}
        port={props.picker}
        noun="record"
        resultsLabel="Records found"
        unavailable={props.unavailable}
        isListed={() => false}
        onPick={(choice) => props.onEdit(setRef('target', { kind: choice.kind, id: choice.id }))}
      />
      <p className={styles.hint}>Routes cannot be chosen yet: they have no search until Phase 7.</p>
    </div>
  );
}
