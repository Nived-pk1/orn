/**
 * Numeric quantities with units in legacy free text (docs/MIGRATION.md §4.5, §4.6): temperatures (`443 K`, `140°C`, `0-5 °C`,
 * `0–5 °C`) and pressures (`1 atm`, `2-3 bar`) as the schema's `value` / `range` shapes. Pure and linear-time (sticky regexes
 * from each number, no nested quantifiers); never throws; finds spans, never rewrites text.
 *
 * Only what is unambiguous becomes a hit. Everything that LOOKS like a quantity but is not decidable is reported as a
 * `problem` with its span, and is never turned into a value: an unsupported unit (`°F`, `psi`), a range written downwards
 * (`5-0 °C`, never reordered), a temperature below absolute zero, a number that overflows. A number with no unit is not a
 * quantity at all. A range needs the same unit on both ends when it is written twice (`0 °C - 5 °C`).
 */
import type { Temperature } from '../schema';

export type TemperatureUnit = 'C' | 'K';
export type PressureUnit = 'atm' | 'bar' | 'kPa' | 'mmHg';

export type QuantityValue<U extends string> =
  | { readonly kind: 'value'; readonly value: number; readonly unit: U }
  | { readonly kind: 'range'; readonly min: number; readonly max: number; readonly unit: U };

export interface QuantityHit<U extends string> {
  readonly start: number;
  readonly end: number;
  readonly value: QuantityValue<U>;
}

export interface QuantityProblem {
  readonly start: number;
  readonly end: number;
  readonly reason: 'unsupported_unit' | 'mixed_units' | 'descending_range' | 'out_of_range' | 'not_finite' | 'missing_unit_letter';
}

export interface QuantityScan<U extends string> {
  readonly hits: readonly QuantityHit<U>[];
  readonly problems: readonly QuantityProblem[];
}

type UnitMatch<U extends string> = { readonly end: number; readonly unit: U } | { readonly end: number; readonly problem: QuantityProblem['reason'] };

interface Family<U extends string> {
  unitAt(text: string, from: number): UnitMatch<U> | null;
  /** A reason the value is not acceptable for the unit, or null. */
  check(value: number, unit: U): QuantityProblem['reason'] | null;
}

const NUMBER = /(?<![A-Za-z0-9.])[-+−]?\d{1,15}(?:\.\d{1,15})?/g;
const NUMBER_AT = /[-+−]?\d{1,15}(?:\.\d{1,15})?/y;
const RANGE_DASH = /\s*[-‐‑–]\s*/y;
const DEGREE_UNIT = /\s*[°º˚]\s*([A-Za-z]+)?/y;
const BARE_UNIT = /\s*([KkCc])(?![A-Za-z0-9])/y;

const toNumber = (text: string): number => Number(text.replace('−', '-').replace(/^\+/, ''));

function sticky<T extends RegExp>(pattern: T, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

function temperatureUnitAt(text: string, from: number, bareCelsius: boolean): UnitMatch<TemperatureUnit> | null {
  const degree = sticky(DEGREE_UNIT, text, from);
  if (degree !== null) {
    const letters = degree[1];
    const end = from + degree[0].length;
    if (letters === undefined) return { end, problem: 'missing_unit_letter' };
    if (letters.length === 1 && /[CcKk]/.test(letters)) return { end, unit: letters.toUpperCase() as TemperatureUnit };
    return { end, problem: 'unsupported_unit' };
  }
  const bare = sticky(BARE_UNIT, text, from);
  if (bare === null) return null;
  const letter = (bare[1] as string).toUpperCase();
  if (letter === 'C' && !bareCelsius) return null;
  return { end: from + bare[0].length, unit: letter as TemperatureUnit };
}

const PRESSURE_UNIT = /\s*(atm(?:ospheres?)?|bar|kpa|mm\s?hg)(?![A-Za-z0-9])/iy;
const UNSUPPORTED_PRESSURE_UNIT = /\s*(pa|mpa|mbar|psi|torr)(?![A-Za-z0-9])/iy;

function pressureUnitAt(text: string, from: number): UnitMatch<PressureUnit> | null {
  const known = sticky(PRESSURE_UNIT, text, from);
  if (known !== null) {
    const word = (known[1] as string).toLowerCase().replace(/\s/g, '');
    const unit: PressureUnit = word.startsWith('atm') ? 'atm' : word === 'bar' ? 'bar' : word === 'kpa' ? 'kPa' : 'mmHg';
    return { end: from + known[0].length, unit };
  }
  const other = sticky(UNSUPPORTED_PRESSURE_UNIT, text, from);
  return other === null ? null : { end: from + other[0].length, problem: 'unsupported_unit' };
}

function scan<U extends string>(text: string, family: Family<U>): QuantityScan<U> {
  const hits: QuantityHit<U>[] = [];
  const problems: QuantityProblem[] = [];
  const pushSingle = (value: number, unit: U, start: number, end: number): void => {
    const reason = !Number.isFinite(value) ? 'not_finite' : family.check(value, unit);
    if (reason !== null) problems.push({ start, end, reason });
    else hits.push({ start, end, value: { kind: 'value', value, unit } });
  };
  const pushRange = (min: number, max: number, unit: U, start: number, end: number): void => {
    const reason = !Number.isFinite(min) || !Number.isFinite(max) ? 'not_finite' : min > max ? 'descending_range' : (family.check(min, unit) ?? family.check(max, unit));
    if (reason !== null) problems.push({ start, end, reason });
    else hits.push({ start, end, value: { kind: 'range', min, max, unit } });
  };
  const numbers = new RegExp(NUMBER.source, 'g');
  for (let found = numbers.exec(text); found !== null; found = numbers.exec(text)) {
    const start = found.index;
    const first = toNumber(found[0]);
    const afterFirst = start + found[0].length;
    const firstUnit = family.unitAt(text, afterFirst);
    const beforeDash = firstUnit === null ? afterFirst : firstUnit.end;
    const dash = sticky(RANGE_DASH, text, beforeDash);
    if (dash !== null) {
      const secondAt = beforeDash + dash[0].length;
      const second = sticky(NUMBER_AT, text, secondAt);
      if (second !== null) {
        const secondEnd = secondAt + second[0].length;
        const secondUnit = family.unitAt(text, secondEnd);
        if (secondUnit !== null) {
          const consumed = secondUnit.end;
          numbers.lastIndex = consumed;
          const problem = (reason: QuantityProblem['reason']): void => void problems.push({ start, end: consumed, reason });
          if ('problem' in secondUnit) problem(secondUnit.problem);
          else if (firstUnit !== null && 'problem' in firstUnit) problem(firstUnit.problem);
          else if (firstUnit !== null && 'unit' in firstUnit && firstUnit.unit !== secondUnit.unit) problem('mixed_units');
          else pushRange(first, toNumber(second[0]), secondUnit.unit, start, consumed);
          continue;
        }
      }
    }
    if (firstUnit !== null) {
      numbers.lastIndex = firstUnit.end;
      if ('problem' in firstUnit) problems.push({ start, end: firstUnit.end, reason: firstUnit.problem });
      else pushSingle(first, firstUnit.unit, start, firstUnit.end);
    }
  }
  return { hits, problems };
}

const ABSOLUTE_ZERO_C = -273.15;

export interface TemperatureScanOptions {
  /** Accept a bare `C` after a number (`25 C`). Only safe when the text is known to be a temperature field. */
  readonly bareCelsius: boolean;
}

export function scanTemperatures(text: string, options: TemperatureScanOptions): QuantityScan<TemperatureUnit> {
  return scan(text, {
    unitAt: (source, from) => temperatureUnitAt(source, from, options.bareCelsius),
    check: (value, unit) => (unit === 'K' ? (value < 0 ? 'out_of_range' : null) : value < ABSOLUTE_ZERO_C ? 'out_of_range' : null),
  });
}

export function scanPressures(text: string): QuantityScan<PressureUnit> {
  return scan(text, { unitAt: pressureUnitAt, check: (value) => (value < 0 ? 'out_of_range' : null) });
}

/** A scanned temperature as the schema's `Temperature`. */
export function toTemperature(value: QuantityValue<TemperatureUnit>): Temperature {
  return value.kind === 'value' ? { kind: 'value', value: value.value, unit: value.unit } : { kind: 'range', min: value.min, max: value.max, unit: value.unit };
}
