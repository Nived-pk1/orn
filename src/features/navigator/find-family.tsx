/**
 * "Find a family" (step 8.2b, E): a native text box with a list of suggestions (a datalist, there is no combobox primitive). Typing narrows
 * the family names; picking one, or Enter with exactly one match, chooses it (the map then focuses it and pans to it); Esc clears the box.
 * It only reports the choice.
 */
import { useId, useState, type KeyboardEvent } from 'react';
import { matchFamilies, type NamedFamily } from './find-family-match';
import styles from './navigator.module.css';

export function FindFamily(props: { readonly families: readonly NamedFamily[]; readonly onChoose: (id: string) => void; readonly phone?: boolean }) {
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
        {...(props.phone === true ? { 'data-phone': '' } : {})}
      />
      <datalist id={listId}>
        {matches.map((family) => (
          <option key={family.id} value={family.name} />
        ))}
      </datalist>
    </>
  );
}
