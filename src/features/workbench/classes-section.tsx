/**
 * The Classes section of a species (step 6.2a part 4, decision D2; on the generic picker since 6.2b decision D4): the classes the species
 * lists (with Remove), the picker that searches classes by name through the search engine (kind and scope shown beside each result), and
 * the SUGGESTIONS from the structure check (CHEM-007) as chips "Alcohols (matches its pattern)  Add". A suggestion is never assigned by
 * itself: only the Add button edits the draft. No "create new class" here (step 6.7).
 */
import { Button } from '@/ui/primitives';
import type { ClassSuggestion } from './check-contracts';
import { RecordList, RecordPicker } from './record-picker';
import type { RecordPickerPort } from './record-picker-contracts';
import type { SectionProps } from './section-props';
import { addClass, removeClass, speciesViewOf } from './species-model';
import styles from './editor.module.css';

export interface ClassesSectionProps extends SectionProps {
  readonly picker?: RecordPickerPort;
  readonly suggestions: readonly ClassSuggestion[];
}

const CLASS_ONLY = ['class'] as const;

export function ClassesSection(props: ClassesSectionProps) {
  const { picker, onEdit } = props;
  const locked = props.unavailable;
  const listed = speciesViewOf(props.draft).classIds;
  const offered = props.suggestions.filter((suggestion) => !listed.includes(suggestion.classId));
  return (
    <div>
      <h4 className={styles.hint}>Listed classes</h4>
      <RecordList label="Listed classes" fieldPath="classIds" items={listed.map((id) => ({ kind: 'class' as const, id }))} port={picker} unavailable={locked} onRemove={(index) => onEdit(removeClass(listed[index] as string))} />
      {offered.length === 0 ? null : (
        <div>
          <h4 className={styles.hint}>Suggested from the structure</h4>
          <ul className={styles.chips} aria-label="Suggested classes">
            {offered.map((suggestion) => {
              const name = picker?.describe('class', suggestion.classId)?.name ?? suggestion.classId;
              return (
                <li key={suggestion.classId} className={styles.chip}>
                  <span>{name} (matches its pattern)</span>
                  <Button aria-label={`Add ${name}`} {...(locked === undefined ? { onClick: () => onEdit(addClass(suggestion.classId)) } : { unavailable: locked })}>
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <RecordPicker id="class-search" label="Find a class by name" kinds={CLASS_ONLY} port={picker} noun="class" resultsLabel="Classes found" unavailable={locked} isListed={(choice) => listed.includes(choice.id)} onPick={(choice) => onEdit(addClass(choice.id))} />
    </div>
  );
}
