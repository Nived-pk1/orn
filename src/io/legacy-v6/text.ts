/**
 * Helpers of the legacy v6 data layer (`arr`, `list`, `lines`) plus the small JS-semantics helpers the port needs to keep
 * v6's quirks: JS truthiness (`x || fallback`), own-property reads, `Object.assign` that cannot trip on `__proto__`.
 * Legacy values are untrusted JSON, so everything here takes and returns `unknown`.
 */

export type LegacyObject = Record<string, unknown>;

/** JS `typeof x === 'object' && x !== null`: arrays count, exactly as in the legacy code. */
export const isObj = (value: unknown): value is LegacyObject => typeof value === 'object' && value !== null;

/** `x.key` for the keys the legacy code reads, which are never inherited ones: an own property or undefined. */
export function field(value: unknown, key: string): unknown {
  return isObj(value) && Object.hasOwn(value, key) ? value[key] : undefined;
}

/** JS `x || fallback`: the fallback replaces every falsy value (`''`, `0`, `false`, `null`, `undefined`, `NaN`). */
export function or<T>(value: unknown, fallback: T): unknown {
  return value ? value : fallback;
}

/**
 * `Object.assign(target, ...sources)` for own enumerable keys, mutating and returning `target`. A key that exists keeps
 * its position. Keys are defined, not set, so a `__proto__` key becomes an ordinary property and never a prototype.
 */
export function assignOwn<T extends LegacyObject>(target: T, ...sources: readonly unknown[]): T {
  for (const source of sources) {
    if (!isObj(source)) continue;
    for (const key of Object.keys(source)) {
      Object.defineProperty(target, key, { value: source[key], enumerable: true, writable: true, configurable: true });
    }
  }
  return target;
}

export const arr = (value: unknown): readonly unknown[] => (Array.isArray(value) ? (value as readonly unknown[]) : []);

/** Legacy `list`: an array's items, or a string split on commas, each trimmed with empties dropped. */
export function list(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? (value as unknown[]) : String(or(value, '')).split(',');
  return items.map((item) => String(item).trim()).filter(Boolean);
}

/** Legacy `lines`: like `list`, but a string splits on newlines. */
export function lines(value: unknown): string[] {
  const items: unknown[] = Array.isArray(value) ? (value as unknown[]) : String(or(value, '')).split('\n');
  return items.map((item) => String(item).trim()).filter(Boolean);
}

/**
 * The legacy code would throw a TypeError here (or, on a non-object record, build garbage from it). The port never
 * throws across its boundary: this is caught once, in `normalizeLegacyData`, and returned as a value.
 */
export class LegacyRefusal extends Error {
  constructor(
    readonly code: 'NOT_AN_OBJECT' | 'INVALID_RECORD' | 'INVALID_COMPOUND_NAME',
    message: string,
    readonly path: string,
  ) {
    super(message);
  }
}
