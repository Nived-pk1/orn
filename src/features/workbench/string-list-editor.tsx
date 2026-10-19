/**
 * An editable list of single-line texts: one input per item with Up, Down and Remove, and an "Add" button (the list pieces of the Names
 * section, shared since step 6.3a by the reaction's aliases). A phone stacks each row (the field on its own row, the three buttons under it).
 * It stores nothing and decides nothing: it reports each change as a callback; an empty item is kept as typed (the schema's finding says so).
 */
import { Button } from '@/ui/primitives';
import styles from './editor.module.css';

export interface StringListEditorProps {
  /** The heading and the accessible name of the group ("Aliases"). */
  readonly title: string;
  /** One item, singular, capitalised ("Alias"): "Alias 2" labels the second input; the add button says "Add alias". */
  readonly one: string;
  readonly items: readonly string[];
  /** The draft path of the list ("aliases"); item i is `${path}[i]`. */
  readonly path: string;
  readonly invalid?: ReadonlySet<string> | undefined;
  readonly unavailable?: string | undefined;
  readonly phone?: boolean | undefined;
  readonly onSet: (index: number, value: string, path: string) => void;
  readonly onAdd: () => void;
  readonly onRemove: (index: number) => void;
  readonly onMove: (index: number, by: -1 | 1) => void;
}

export function StringListEditor(props: StringListEditorProps) {
  const { items, unavailable, one } = props;
  return (
    <div className={styles.list} role="group" aria-label={props.title}>
      <h4>{props.title}</h4>
      {items.length === 0 ? <p className={styles.hint}>None.</p> : null}
      <ul>
        {items.map((item, index) => {
          const path = `${props.path}[${index}]`;
          const number = index + 1;
          const who = props.phone === true && item !== '' ? item : `${one.toLowerCase()} ${number}`;
          return (
            // the list has no identity of its own: a row is its position
            <li key={index} className={props.phone === true ? `${styles.row} ${styles.rowPhone}` : styles.row}>
              <input
                type="text"
                value={item}
                readOnly={unavailable !== undefined}
                aria-label={`${one} ${number}`}
                aria-invalid={props.invalid?.has(path) === true ? true : undefined}
                data-field-path={path}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => props.onSet(index, event.target.value, path)}
              />
              <Button aria-label={`Move ${who} up`} {...(unavailable !== undefined ? { unavailable } : index === 0 ? { unavailable: 'it is the first' } : { onClick: () => props.onMove(index, -1) })}>
                Up
              </Button>
              <Button aria-label={`Move ${who} down`} {...(unavailable !== undefined ? { unavailable } : index === items.length - 1 ? { unavailable: 'it is the last' } : { onClick: () => props.onMove(index, 1) })}>
                Down
              </Button>
              <Button aria-label={`Remove ${who}`} {...(unavailable !== undefined ? { unavailable } : { onClick: () => props.onRemove(index) })}>
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
      <Button {...(unavailable !== undefined ? { unavailable } : { onClick: props.onAdd })}>{`Add ${one.toLowerCase()}`}</Button>
    </div>
  );
}
