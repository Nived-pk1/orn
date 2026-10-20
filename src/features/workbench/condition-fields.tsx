/**
 * The conditions form of ONE stage or condition variant (step 6.4a D1 and D2): every field the schema has, as the arrow's words allow.
 * Temperature / pressure / time (value, range, word), medium, solvent character, anhydrous, light, atmosphere, activation, the other
 * qualifiers as a list and the free text. A field read from text (`parsedFields`) says "Read from the text: please confirm." with a Confirm
 * button; editing it also confirms it. A variant shows only the fields it overrides (`only`) and a Remove for each (`onRemove`).
 * Text only; the recipes (`condition-model.ts`) and the core decide.
 */
import type { ReactNode } from 'react';
import { ACTIVATIONS, ATMOSPHERES, LIGHT_CONDITIONS, MEDIA, SOLVENT_CHARACTERS } from '@/core/schema';
import { Button } from '@/ui/primitives';
import { MeasureField } from './condition-measure';
import {
  addQualifier,
  confirmField,
  moveQualifier,
  parametersOf,
  parsedFieldsOf,
  paramsPath,
  removeQualifier,
  setAnhydrous,
  setChoice,
  setConditionText,
  setListMember,
  setQualifier,
  type ChoiceField,
  type ListField,
  type ParameterField,
  type ParamsLoc,
} from './condition-model';
import type { SectionProps } from './section-props';
import { StringListEditor } from './string-list-editor';
import styles from './condition.module.css';

export type ConditionFieldName = ParameterField | 'other' | 'text';

export interface ConditionFieldsProps extends SectionProps {
  readonly loc: ParamsLoc;
  /** How the row is spoken of in the labels: "stage 1", "variant 2". */
  readonly who: string;
  /** Only these fields are drawn (a variant's overrides); absent: every field. */
  readonly only?: ReadonlySet<ConditionFieldName>;
  /** Present: each drawn field has a Remove that calls it (a variant takes an override out). */
  readonly onRemove?: (field: ConditionFieldName) => void;
}

const LIGHT_WORDS: Readonly<Record<string, string>> = { hv: 'hν', uv: 'UV' };
const spaced = (word: string): string => LIGHT_WORDS[word] ?? word.replace(/_/g, ' ');

const CHOICES: readonly { readonly field: ChoiceField; readonly title: string; readonly words: readonly string[] }[] = [
  { field: 'medium', title: 'Medium', words: MEDIA },
  { field: 'light', title: 'Light', words: LIGHT_CONDITIONS },
  { field: 'atmosphere', title: 'Atmosphere', words: ATMOSPHERES },
];
const LISTS: readonly { readonly field: ListField; readonly title: string; readonly words: readonly string[] }[] = [
  { field: 'solventCharacter', title: 'Solvent character', words: SOLVENT_CHARACTERS },
  { field: 'activation', title: 'Activation', words: ACTIVATIONS },
];
const MEASURES = [
  ['temperature', 'Temperature'],
  ['pressure', 'Pressure'],
  ['time', 'Time'],
] as const;

export function ConditionFields(props: ConditionFieldsProps) {
  const { loc, who, onEdit, only } = props;
  const locked = props.unavailable;
  const base = paramsPath(loc);
  const params = parametersOf(props.draft, loc);
  const parsed: readonly string[] = parsedFieldsOf(params);
  const shown = (field: ConditionFieldName): boolean => only === undefined || only.has(field);
  const bad = (path: string): true | undefined => (props.invalid?.has(path) === true ? true : undefined);
  const wrapper = (field: ConditionFieldName, title: string, children: ReactNode, wide = false) => (
    <div key={field} className={wide ? styles.wide : undefined} data-condition-field={field}>
      {children}
      {parsed.includes(field) ? (
        <p className={styles.parsed}>
          <span>Read from the text: please confirm.</span>
          <Button aria-label={`Confirm ${title.toLowerCase()} of ${who}`} data-field-path={`${base}.parsedFields`} {...(locked !== undefined ? { unavailable: locked } : { onClick: () => onEdit(confirmField(loc, field as ParameterField)) })}>
            Confirm
          </Button>
        </p>
      ) : null}
      {props.onRemove === undefined ? null : (
        <Button aria-label={`Remove ${title.toLowerCase()} override of ${who}`} {...(locked !== undefined ? { unavailable: locked } : { onClick: () => props.onRemove?.(field) })}>
          Remove
        </Button>
      )}
    </div>
  );
  const choice = (field: ChoiceField, title: string, words: readonly string[]) => (
    <div className={styles.group} role="group" aria-label={title}>
      <label htmlFor={`cond-${who}-${field}`}>{title}</label>
      <select id={`cond-${who}-${field}`} aria-label={`${title} of ${who}`} value={typeof params[field] === 'string' ? (params[field] as string) : ''} disabled={locked !== undefined} aria-invalid={bad(`${base}.${field}`)} data-field-path={`${base}.${field}`} onChange={(event) => onEdit(setChoice(loc, field, event.target.value))}>
        <option value="">Not stated</option>
        {words.map((word) => (
          <option key={word} value={word}>
            {spaced(word)}
          </option>
        ))}
      </select>
    </div>
  );
  const list = (field: ListField, title: string, words: readonly string[]) => {
    const chosen: readonly unknown[] = Array.isArray(params[field]) ? (params[field] as unknown[]) : [];
    return (
      <fieldset className={styles.group} aria-invalid={bad(`${base}.${field}`)} data-field-path={`${base}.${field}`}>
        <legend>{title}</legend>
        <div className={styles.checks}>
          {words.map((word) => (
            <label key={word}>
              <input type="checkbox" checked={chosen.includes(word)} disabled={locked !== undefined} aria-label={`${title}: ${spaced(word)} (${who})`} onChange={(event) => onEdit(setListMember(loc, field, word, event.target.checked))} />
              {spaced(word)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  };
  return (
    <div className={`${styles.conditions} ${props.phone === true ? styles.stacked : ''}`} role="group" aria-label={`Conditions of ${who}`}>
      {parsed.length === 0 ? null : <p className={styles.hint}>Fields marked "Read from the text" are not confirmed yet. Confirm keeps the value; editing a field also confirms it.</p>}
      <div className={styles.grid}>
        {MEASURES.map(([field, title]) =>
          shown(field) ? wrapper(field, title, <MeasureField field={field} loc={loc} base={base} who={who} value={params[field]} onEdit={onEdit} invalid={props.invalid} unavailable={locked} />, true) : null,
        )}
        {CHOICES.map(({ field, title, words }) => (shown(field) ? wrapper(field, title, choice(field, title, words)) : null))}
        {shown('anhydrous')
          ? wrapper(
              'anhydrous',
              'Anhydrous',
              <div className={styles.group} role="group" aria-label="Anhydrous">
                <label htmlFor={`cond-${who}-anhydrous`}>Anhydrous</label>
                <select id={`cond-${who}-anhydrous`} aria-label={`Anhydrous of ${who}`} value={typeof params.anhydrous === 'boolean' ? (params.anhydrous ? 'yes' : 'no') : ''} disabled={locked !== undefined} aria-invalid={bad(`${base}.anhydrous`)} data-field-path={`${base}.anhydrous`} onChange={(event) => onEdit(setAnhydrous(loc, event.target.value as '' | 'yes' | 'no'))}>
                  <option value="">Not stated</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>,
            )
          : null}
        {LISTS.map(({ field, title, words }) => (shown(field) ? wrapper(field, title, list(field, title, words), true) : null))}
        {shown('other')
          ? wrapper(
              'other',
              'Other qualifiers',
              <StringListEditor
                title={`Other qualifiers of ${who}`}
                one="Qualifier"
                items={(Array.isArray(params.other) ? params.other : []).map((item) => (typeof item === 'string' ? item : ''))}
                path={`${base}.other`}
                invalid={props.invalid}
                unavailable={locked}
                phone={props.phone}
                onSet={(index, value, path) => onEdit(setQualifier(loc, index, value), path)}
                onAdd={() => onEdit(addQualifier(loc))}
                onRemove={(index) => onEdit(removeQualifier(loc, index))}
                onMove={(index, by) => onEdit(moveQualifier(loc, index, by))}
              />,
              true,
            )
          : null}
        {shown('text')
          ? wrapper(
              'text',
              'Free text',
              <div className={styles.group} role="group" aria-label="Free text">
                <label htmlFor={`cond-${who}-text`}>Free text (optional)</label>
                <textarea id={`cond-${who}-text`} aria-label={`Free text of ${who}`} value={typeof params.text === 'string' ? params.text : ''} readOnly={locked !== undefined} aria-invalid={bad(`${base}.text`)} data-field-path={`${base}.text`} onChange={(event) => onEdit(setConditionText(loc, event.target.value), `${base}.text`)} />
              </div>,
              true,
            )
          : null}
      </div>
    </div>
  );
}
