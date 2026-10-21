/**
 * A number the person types (step 6.6c): kept as typed while it is being typed ("2." and "-" are on the way to a number), stored only
 * when the text is a finite number, and removed when emptied. What the field shows follows the draft again when the draft changes
 * from outside (undo, redo). Nothing is rounded or fixed.
 */
import { useEffect, useState } from 'react';
import styles from './editor.module.css';

export interface NumberFieldProps {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly value: number | undefined;
  readonly onChange: (value: number | undefined) => void;
  readonly invalid?: boolean | undefined;
  readonly unavailable?: string | undefined;
  readonly hint?: string | undefined;
  readonly integer?: boolean;
}

const NUMBER = /^-?\d+(\.\d+)?$/;
const WHOLE = /^-?\d+$/;

export function NumberField(props: NumberFieldProps) {
  const [text, setText] = useState(props.value === undefined ? '' : String(props.value));
  useEffect(() => {
    setText((typed) => {
      const parsed = NUMBER.test(typed) ? Number(typed) : undefined;
      return parsed === props.value || (props.value === undefined && !NUMBER.test(typed) && typed !== '') ? typed : props.value === undefined ? '' : String(props.value);
    });
  }, [props.value]);
  return (
    <div className={styles.field}>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="text"
        inputMode="decimal"
        value={text}
        readOnly={props.unavailable !== undefined}
        aria-invalid={props.invalid === true ? true : undefined}
        data-field-path={props.path}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          if (next === '') props.onChange(undefined);
          else if ((props.integer === true ? WHOLE : NUMBER).test(next)) props.onChange(Number(next));
        }}
      />
      {props.hint === undefined ? null : <p className={styles.hint}>{props.hint}</p>}
    </div>
  );
}
