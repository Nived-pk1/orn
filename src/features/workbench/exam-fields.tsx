/**
 * A one-line text field of the exam editors (exams step part 2): the label, the typed text, the schema path for the findings, and a hint.
 * The text is stored exactly as typed (`setText`: an optional text is removed when emptied).
 */
import type { DraftRecipe } from '@/core/editing';
import { setText } from './exam-model';
import styles from './editor.module.css';

export function TextField(props: {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly value: string;
  readonly required?: boolean;
  /** The recipe for a typed value; absent: the top-level field `path`. */
  readonly make?: (value: string) => DraftRecipe;
  readonly hint?: string;
  readonly invalid?: boolean;
  readonly unavailable?: string | undefined;
  readonly onEdit: (recipe: DraftRecipe, path?: string) => void;
}) {
  return (
    <div className={styles.field}>
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="text"
        value={props.value}
        readOnly={props.unavailable !== undefined}
        aria-invalid={props.invalid === true ? true : undefined}
        data-field-path={props.path}
        autoComplete="off"
        onChange={(event) => props.onEdit(props.make?.(event.target.value) ?? setText(props.path, event.target.value, props.required === true), props.path)}
      />
      {props.hint === undefined ? null : <p className={styles.hint}>{props.hint}</p>}
    </div>
  );
}
