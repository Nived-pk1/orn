/**
 * The Classes section (step 6.2a part 4, decision D2): the classes the species lists (with Remove), a basic picker that searches classes
 * by name through the search engine (kind and scope shown beside each result), and the SUGGESTIONS from the structure check (CHEM-007)
 * as chips "Alcohols (matches its pattern)  Add". A suggestion is never assigned by itself: only the Add button edits the draft. No
 * "create new class" here (step 6.7).
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives';
import type { ClassSuggestion } from './check-contracts';
import type { ClassChoice, ClassPickerPort } from './class-picker-contracts';
import type { SectionProps } from './section-props';
import { addClass, removeClass, speciesViewOf } from './species-model';
import styles from './editor.module.css';

export const MAX_PICKER_RESULTS = 8;

export interface ClassesSectionProps extends SectionProps {
  readonly picker?: ClassPickerPort;
  readonly suggestions: readonly ClassSuggestion[];
}

const lineOf = (choice: ClassChoice | undefined, id: string): string => (choice === undefined ? `${id} (not in this dataset)` : `${choice.name} (${choice.kind}, ${choice.scope})`);

export function ClassesSection(props: ClassesSectionProps) {
  const { picker, onEdit } = props;
  const locked = props.unavailable;
  const listed = speciesViewOf(props.draft).classIds;
  const [text, setText] = useState('');
  const [results, setResults] = useState<readonly ClassChoice[]>([]);
  const ask = useRef(0);

  useEffect(() => {
    ask.current += 1;
    const mine = ask.current;
    if (picker === undefined || text.trim() === '') {
      setResults([]);
      return;
    }
    void picker.search(text).then((found) => {
      if (mine === ask.current) setResults(found.slice(0, MAX_PICKER_RESULTS)); // an answer for an older text is dropped
    });
  }, [picker, text]);

  const offered = props.suggestions.filter((suggestion) => !listed.includes(suggestion.classId));
  const add = (id: string): void => onEdit(addClass(id));
  return (
    <div>
      <h4 className={styles.hint}>Listed classes</h4>
      {listed.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul className={styles.chips} aria-label="Listed classes" data-field-path="classIds">
        {listed.map((id) => (
          <li key={id} className={styles.chip}>
            <span>{lineOf(picker?.describe(id), id)}</span>
            <Button aria-label={`Remove ${picker?.describe(id)?.name ?? id}`} {...(locked === undefined ? { onClick: () => onEdit(removeClass(id)) } : { unavailable: locked })}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {offered.length === 0 ? null : (
        <div>
          <h4 className={styles.hint}>Suggested from the structure</h4>
          <ul className={styles.chips} aria-label="Suggested classes">
            {offered.map((suggestion) => {
              const name = picker?.describe(suggestion.classId)?.name ?? suggestion.classId;
              return (
                <li key={suggestion.classId} className={styles.chip}>
                  <span>{name} (matches its pattern)</span>
                  <Button aria-label={`Add ${name}`} {...(locked === undefined ? { onClick: () => add(suggestion.classId) } : { unavailable: locked })}>
                    Add
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {picker === undefined ? (
        <p className={styles.hint}>Searching for classes is not available here.</p>
      ) : (
        <div className={styles.field}>
          <label htmlFor="class-search">Find a class by name</label>
          <input id="class-search" type="search" value={text} readOnly={locked !== undefined} autoComplete="off" onChange={(event) => setText(event.target.value)} />
          {results.length === 0 ? (
            text.trim() === '' ? null : <p className={styles.hint}>No class matches.</p>
          ) : (
            <ul className={styles.results} aria-label="Classes found">
              {results.map((choice) => (
                <li key={choice.id} className={styles.choice}>
                  <span>{lineOf(choice, choice.id)}</span>
                  {listed.includes(choice.id) ? (
                    <span className={styles.hint}>Already listed</span>
                  ) : (
                    <Button aria-label={`Add ${choice.name}`} {...(locked === undefined ? { onClick: () => add(choice.id) } : { unavailable: locked })}>
                      Add
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
