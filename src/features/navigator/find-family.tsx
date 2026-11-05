/**
 * "Find a family" (step 8.2b, E): a native text box with a list of suggestions (a datalist, there is no combobox primitive). Typing narrows
 * the family names; picking one, or Enter with exactly one match, chooses it (the map then focuses it and pans to it); Esc clears the box.
 * It only reports the choice.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { matchFamilies, type NamedFamily } from './find-family-match';
import styles from './map-controls.module.css';

/** The person just pressed the Find button: the box they asked for takes the focus. */
const takeFocus = (element: HTMLInputElement | null): void => element?.focus();

export function FindFamily(props: {
  readonly families: readonly NamedFamily[];
  readonly onChoose: (id: string) => void;
  readonly phone?: boolean;
  /** The phone opens the box over its controls row: it takes the focus, and Esc or the close button asks to put the row back. */
  readonly autoFocus?: boolean;
  readonly onClose?: () => void;
}) {
  const [text, setText] = useState('');
  const listId = useId();
  const matches = matchFamilies(props.families, text);
  const choose = (id: string): void => {
    props.onChoose(id);
  };
  const onChange = (value: string): void => {
    setText(value);
    const exact = props.families.filter((f) => f.name === value);
    if (exact.length === 1) choose((exact[0] as NamedFamily).id);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      setText('');
      event.stopPropagation();
      props.onClose?.();
    } else if (event.key === 'Enter' && matches.length === 1) {
      event.preventDefault();
      choose((matches[0] as NamedFamily).id);
    }
  };
  return (
    <>
      <input
        type="text"
        role="combobox"
        aria-label="Find a family"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder="Find a family"
        className={styles.findBox}
        list={listId}
        value={text}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        ref={props.autoFocus === true ? takeFocus : undefined}
        {...(props.phone === true ? { 'data-phone': '' } : {})}
      />
      {props.onClose === undefined ? null : (
        <button type="button" className={styles.closeFind} aria-label="Close find" onClick={props.onClose}>
          <span aria-hidden="true">✕</span>
        </button>
      )}
      <datalist id={listId}>
        {matches.map((family) => (
          <option key={family.id} value={family.name} />
        ))}
      </datalist>
    </>
  );
}
