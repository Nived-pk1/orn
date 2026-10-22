/**
 * The generic record picker and the list of chosen records (step 6.2b decision D4). The picker searches species, classes or reagents by
 * name through the port (kind and scope shown beside every result), offers "Add <name>" for each, says "Already listed" for a record that is
 * chosen, and for a record that may not be chosen (a cycle) shows the REASON instead of a button. Keyboard: Tab reaches the field, then each
 * result's button; the result count is announced (a status region). The list shows each chosen record with Remove (and Up / Down where the
 * order matters). "Create new" rows (step 6.7a, `create-new.tsx`) when the host provides them. No chemistry and no rules: the port and the draft decide.
 */
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/ui/primitives';
import { canCreate, NESTED_SENTENCE, useCreateNew } from './create-new';
import { kindWords } from './form-kinds';
import type { PickKind, RecordChoice, RecordPickerPort } from './record-picker-contracts';
import styles from './editor.module.css';

export const MAX_PICKER_RESULTS = 8;

export const choiceLine = (choice: RecordChoice | undefined, id: string): string => (choice === undefined ? `${id} (not in this dataset)` : `${choice.name} (${choice.kindWords}${choice.scope === '' ? '' : `, ${choice.scope}`})`);

export interface RecordPickerProps {
  /** The field's id (the label's target). */
  readonly id: string;
  readonly label: string;
  readonly kinds: readonly PickKind[];
  readonly port: RecordPickerPort | undefined;
  readonly onPick: (choice: RecordChoice) => void;
  readonly isListed: (choice: RecordChoice) => boolean;
  /** Why this record may not be chosen (words); undefined: it may. */
  readonly refusal?: (choice: RecordChoice) => string | undefined;
  readonly unavailable?: string | undefined;
  /** What is searched for, singular, lower case ("class", "species", "record"): used in the words of the status and the results list. */
  readonly noun?: string;
  /** The accessible name of the results list, plural ('Classes found'). */
  readonly resultsLabel?: string;
  /** Results that fit the field come first under `resultsLabel`; every other result stays choosable under `otherLabel` (no rule forbids it). */
  readonly preferred?: (choice: RecordChoice) => boolean;
  readonly otherLabel?: string;
}

function Results(args: { readonly label: string; readonly results: readonly RecordChoice[]; readonly props: RecordPickerProps }) {
  const { props, results } = args;
  const unavailable = props.unavailable;
  return (
    <ul className={styles.results} aria-label={args.label}>
      {results.map((choice) => {
        const reason = props.refusal?.(choice);
        return (
          <li key={`${choice.kind}:${choice.id}`} className={styles.choice}>
            <span>{choiceLine(choice, choice.id)}</span>
            {props.isListed(choice) ? (
              <span className={styles.hint}>Already listed</span>
            ) : reason !== undefined ? (
              <span className={styles.hint} role="note">
                Cannot be chosen: {reason}
              </span>
            ) : (
              <Button aria-label={`Add ${choice.name}`} {...(unavailable === undefined ? { onClick: () => props.onPick(choice) } : { unavailable })}>
                Add
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RecordPicker(props: RecordPickerProps) {
  const { port, kinds, unavailable } = props;
  const noun = props.noun ?? 'record';
  const [text, setText] = useState('');
  const [results, setResults] = useState<readonly RecordChoice[]>([]);
  const ask = useRef(0);
  const field = useRef<HTMLInputElement | null>(null);
  const create = useCreateNew();
  const kindsKey = kinds.join(',');

  useEffect(() => {
    ask.current += 1;
    const mine = ask.current;
    if (port === undefined || text.trim() === '') {
      setResults([]);
      return;
    }
    void port.search(kinds, text).then((found) => {
      if (mine === ask.current) setResults(found.slice(0, MAX_PICKER_RESULTS)); // an answer for an older text is dropped
    });
    // `kindsKey` stands for the kinds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [port, text, kindsKey]);

  if (port === undefined) return <p className={styles.hint}>Searching for {(props.resultsLabel ?? 'Records found').replace(/ found$/, '').toLowerCase()} is not available here.</p>;
  const searching = text.trim() !== '';
  const first = props.preferred === undefined ? results : results.filter(props.preferred);
  const rest = props.preferred === undefined ? [] : results.filter((choice) => !props.preferred?.(choice));
  return (
    <div className={styles.field}>
      <label htmlFor={props.id}>{props.label}</label>
      <input ref={field} id={props.id} type="search" value={text} readOnly={unavailable !== undefined} autoComplete="off" aria-describedby={`${props.id}-count`} onChange={(event) => setText(event.target.value)} />
      <p id={`${props.id}-count`} className={styles.hint} role="status">
        {!searching ? '' : results.length === 0 ? `No ${noun} matches.` : `${results.length} found`}
      </p>
      {first.length === 0 ? null : <Results label={props.resultsLabel ?? 'Records found'} results={first} props={props} />}
      {rest.length === 0 ? null : (
        <>
          {first.length === 0 ? null : <h4 className={styles.hint}>{props.otherLabel ?? 'Other records'}</h4>}
          <Results label={props.otherLabel ?? 'Other records'} results={rest} props={props} />
        </>
      )}
      {create === undefined || !searching || unavailable !== undefined ? null : create.nested ? (
        <p className={styles.hint} role="note">
          {NESTED_SENTENCE}
        </p>
      ) : (
        <ul className={styles.results} aria-label="Create new">
          {kinds.filter(canCreate).map((kind) => (
            <li key={kind} className={styles.choice}>
              <Button
                onClick={() => {
                  field.current?.focus(); // the dialog returns the focus to what was focused when it opened
                  create.start(kind, text.trim(), (ref) => {
                    const made = port.describe(ref.kind as PickKind, ref.id);
                    if (made !== undefined) props.onPick(made);
                  });
                }}
              >
                {`Create new ${kindWords(kind)} "${text.trim()}"`}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ChosenRecord {
  readonly kind: PickKind;
  readonly id: string;
}

export interface RecordListProps {
  readonly label: string;
  readonly fieldPath: string;
  readonly items: readonly ChosenRecord[];
  readonly port: RecordPickerPort | undefined;
  readonly onRemove: (index: number) => void;
  /** Present when the order matters: Up and Down buttons. */
  readonly onMove?: (index: number, by: -1 | 1) => void;
  readonly unavailable?: string | undefined;
  readonly emptyText?: string;
}

export function RecordList(props: RecordListProps) {
  const { items, port, unavailable } = props;
  return (
    <div>
      {items.length === 0 ? <p className={styles.hint}>{props.emptyText ?? 'None.'}</p> : null}
      <ul className={styles.chips} aria-label={props.label} data-field-path={props.fieldPath}>
        {items.map((item, index) => {
          const choice = port?.describe(item.kind, item.id);
          const name = choice?.name ?? item.id;
          return (
            <li key={`${item.kind}:${item.id}`} className={styles.chip}>
              <span>{choiceLine(choice, item.id)}</span>
              {props.onMove === undefined ? null : (
                <>
                  <Button aria-label={`Move ${name} up`} {...(unavailable !== undefined ? { unavailable } : index === 0 ? { unavailable: 'it is first' } : { onClick: () => props.onMove?.(index, -1) })}>
                    Up
                  </Button>
                  <Button aria-label={`Move ${name} down`} {...(unavailable !== undefined ? { unavailable } : index === items.length - 1 ? { unavailable: 'it is last' } : { onClick: () => props.onMove?.(index, 1) })}>
                    Down
                  </Button>
                </>
              )}
              <Button aria-label={`Remove ${name}`} {...(unavailable === undefined ? { onClick: () => props.onRemove(index) } : { unavailable })}>
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
