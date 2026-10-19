/**
 * The class editor's Identity, Parents and Examples sections (step 6.2b decision D1). Parents come from the generic record picker with the
 * CYCLE question asked before Save: a class cannot get itself or any of its descendants as a parent, and the picker shows the reason
 * instead of a button (HIER-001 would refuse it at Save). Examples are species, ordered. Identity also says, read-only, whether the class
 * is a family on the map (decision D2: making one arrives in step 6.6). Each section renders the draft and reports every change as a
 * recipe with the field path; none decides what is valid (L1 and the store's gate do).
 */
import { CLASS_KINDS } from '@/core/schema';
import { addExample, addParent, CLASS_KIND_WORDS, classViewOf, moveExample, removeExample, removeParent, setClassKind } from './class-model';
import { RecordList, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import styles from './editor.module.css';

export interface ClassPickerSectionProps extends SectionProps {
  readonly picker?: RecordPickerPort;
}

const bad = (props: SectionProps, path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
const CLASSES = ['class'] as const;
const SPECIES = ['species'] as const;

export function ClassIdentitySection(props: ClassPickerSectionProps) {
  const view = classViewOf(props.draft);
  const locked = props.unavailable !== undefined;
  const family = props.picker?.isMapFamily?.(view.id);
  return (
    <div>
      <div className={styles.field}>
        <label htmlFor="class-kind">Kind of class</label>
        <select id="class-kind" value={view.classKind} disabled={locked} aria-invalid={bad(props, 'classKind')} data-field-path="classKind" onChange={(event) => props.onEdit(setClassKind(event.target.value), 'classKind')}>
          <option value="">Choose a kind</option>
          {CLASS_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {CLASS_KIND_WORDS[kind]}
            </option>
          ))}
        </select>
      </div>
      {family === undefined ? null : (
        <p>
          <strong>{family ? 'A family on the map' : 'Not a family on the map'}</strong>
          <span className={styles.hint}> (read-only; making a class a family arrives in step 6.6)</span>
        </p>
      )}
    </div>
  );
}

export function ParentsSection(props: ClassPickerSectionProps) {
  const view = classViewOf(props.draft);
  const { picker } = props;
  const locked = props.unavailable;
  return (
    <div>
      <RecordList label="Parent classes" fieldPath="parentIds" items={view.parentIds.map((id) => ({ kind: 'class' as const, id }))} port={picker} unavailable={locked} emptyText="None: a top-level class." onRemove={(index) => props.onEdit(removeParent(index))} />
      <RecordPicker
        id="parent-search"
        label="Find a parent class by name"
        kinds={CLASSES}
        port={picker}
        noun="class"
        resultsLabel="Classes found"
        unavailable={locked}
        isListed={(choice) => view.parentIds.includes(choice.id)}
        refusal={(choice) => picker?.parentRefusal?.(view.id, choice.id)}
        onPick={(choice) => props.onEdit(addParent(choice.id))}
      />
    </div>
  );
}

export function ExamplesSection(props: ClassPickerSectionProps) {
  const view = classViewOf(props.draft);
  const { picker } = props;
  const locked = props.unavailable;
  return (
    <div>
      <RecordList
        label="Example species"
        fieldPath="exampleSpeciesIds"
        items={view.exampleSpeciesIds.map((id) => ({ kind: 'species' as const, id }))}
        port={picker}
        unavailable={locked}
        emptyText="None."
        onRemove={(index) => props.onEdit(removeExample(index))}
        onMove={(index, by) => props.onEdit(moveExample(index, by))}
      />
      <RecordPicker id="example-search" label="Find an example species by name" kinds={SPECIES} port={picker} noun="species" resultsLabel="Species found" unavailable={locked} isListed={(choice) => view.exampleSpeciesIds.includes(choice.id)} onPick={(choice) => props.onEdit(addExample(choice.id))} />
      <p className={styles.hint}>An example should list this class (or one below it); if it does not, the checks say so (CLS-001).</p>
    </div>
  );
}
