/**
 * One measured condition of the conditions form (step 6.4a D1): temperature, pressure or time as "Not stated", a value, a range (not time)
 * or a word. Choosing a kind stores only the kind; the number, unit and word are then typed or chosen, and a missing one is a finding
 * (RXN / schema), never a default. Values are kept exactly as typed. Text only; the recipes decide.
 */
import { DurationSchema, PRESSURE_UNITS, PressureSchema, QUALITATIVE_TEMPERATURES, TEMPERATURE_UNITS, TIME_UNITS } from '@/core/schema';
import { setMeasureChoice, setMeasureKind, setMeasureNumber, type MeasureField, type MeasureKind, type ParamsLoc } from './condition-model';
import type { SectionProps } from './section-props';
import styles from './condition.module.css';

const spaced = (word: string): string => word.replace(/_/g, ' ');
const unitText = (unit: string): string => (unit === 'C' ? '°C' : unit);
const numberOf = (raw: string): number | undefined => (raw === '' || !Number.isFinite(Number(raw)) ? undefined : Number(raw));

const WORDS: Readonly<Record<MeasureField, readonly string[]>> = {
  temperature: QUALITATIVE_TEMPERATURES,
  pressure: PressureSchema.options[2].shape.value.options,
  time: DurationSchema.options[1].shape.value.options,
};
const UNITS: Readonly<Record<MeasureField, readonly string[]>> = { temperature: TEMPERATURE_UNITS, pressure: PRESSURE_UNITS, time: TIME_UNITS };
const TITLE: Readonly<Record<MeasureField, string>> = { temperature: 'Temperature', pressure: 'Pressure', time: 'Time' };

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);

export interface MeasureProps extends Pick<SectionProps, 'onEdit' | 'invalid' | 'unavailable'> {
  readonly field: MeasureField;
  readonly loc: ParamsLoc;
  /** The path of the parameters ("stages[0].parameters") and how the row is spoken of ("stage 1"). */
  readonly base: string;
  readonly who: string;
  /** The measure as the draft has it (any shape; read tolerantly). */
  readonly value: unknown;
}

export function MeasureField(props: MeasureProps) {
  const { field, loc, who, onEdit } = props;
  const locked = props.unavailable;
  const measure = isBag(props.value) ? props.value : undefined;
  const kind = typeof measure?.kind === 'string' ? measure.kind : '';
  const path = `${props.base}.${field}`;
  const title = TITLE[field];
  const bad = (sub: string | undefined): true | undefined => (props.invalid?.has(sub === undefined ? path : `${path}.${sub}`) === true ? true : undefined);
  const aria = (what: string): string => `${title} ${what} of ${who}`;
  const num = (key: 'value' | 'min' | 'max'): string => (typeof measure?.[key] === 'number' ? String(measure[key]) : '');
  const unit = typeof measure?.unit === 'string' ? measure.unit : '';
  const word = typeof measure?.value === 'string' ? measure.value : '';
  const kinds: readonly (readonly [MeasureKind, string])[] = [
    ['value', 'A value'],
    ...(field === 'time' ? [] : ([['range', 'A range']] as const)),
    ['qualitative', 'A word'],
  ];
  const numberBox = (key: 'value' | 'min' | 'max', label: string) => (
    <input
      type="number"
      step="any"
      aria-label={aria(label)}
      value={num(key)}
      readOnly={locked !== undefined}
      aria-invalid={bad(key)}
      data-field-path={`${path}.${key}`}
      onChange={(event) => onEdit(setMeasureNumber(loc, field, key, numberOf(event.target.value)), `${path}.${key}`)}
    />
  );
  return (
    <fieldset className={styles.group} aria-invalid={bad(undefined)} data-field-path={path}>
      <legend>{title}</legend>
      <select aria-label={aria('kind')} value={kind} disabled={locked !== undefined} aria-invalid={bad('kind')} data-field-path={`${path}.kind`} onChange={(event) => onEdit(setMeasureKind(loc, field, event.target.value as MeasureKind | ''))}>
        <option value="">Not stated</option>
        {kinds.map(([one, text]) => (
          <option key={one} value={one}>
            {text}
          </option>
        ))}
        {kind === '' || kinds.some(([one]) => one === kind) ? null : <option value={kind}>{kind}</option>}
      </select>
      {kind === 'value' || kind === 'range' ? (
        <div className={styles.inline}>
          {kind === 'value' ? numberBox('value', 'value') : null}
          {kind === 'range' ? numberBox('min', 'minimum') : null}
          {kind === 'range' ? <span aria-hidden="true">to</span> : null}
          {kind === 'range' ? numberBox('max', 'maximum') : null}
          <select aria-label={aria('unit')} value={unit} disabled={locked !== undefined} aria-invalid={bad('unit')} data-field-path={`${path}.unit`} onChange={(event) => onEdit(setMeasureChoice(loc, field, 'unit', event.target.value))}>
            <option value="">Unit</option>
            {UNITS[field].map((one) => (
              <option key={one} value={one}>
                {unitText(one)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {kind === 'qualitative' ? (
        <select aria-label={aria('word')} value={word} disabled={locked !== undefined} aria-invalid={bad('value')} data-field-path={`${path}.value`} onChange={(event) => onEdit(setMeasureChoice(loc, field, 'value', event.target.value))}>
          <option value="">Choose a word</option>
          {WORDS[field].map((one) => (
            <option key={one} value={one}>
              {spaced(one)}
            </option>
          ))}
        </select>
      ) : null}
    </fieldset>
  );
}
