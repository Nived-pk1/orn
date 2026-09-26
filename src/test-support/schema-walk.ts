/**
 * Zod schema introspection for tests (docs/TEST_STRATEGY.md §2): walks a schema statically or
 * alongside a value, so the schema suite can derive coverage expectations and mutations from the
 * schema itself instead of hand-maintained lists. Test-only; never imported by production code.
 *
 * Shapes are normalised paths: `reaction.participants[].ref`. Schemas listed in `shared` restart
 * the shape at their own name (`ConditionParameters.temperature`) so reusable value types are
 * covered once across all locations. Union options are addressed as `<shape><label>`.
 */
import type { z } from 'zod';

export type Path = readonly (string | number)[];

interface Def {
  readonly type: string;
  readonly innerType?: z.ZodType;
  readonly shape?: Readonly<Record<string, z.ZodType>>;
  readonly element?: z.ZodType;
  readonly items?: readonly z.ZodType[];
  readonly options?: readonly z.ZodType[];
  readonly discriminator?: string;
  readonly values?: readonly unknown[];
  readonly entries?: Readonly<Record<string, string>>;
  readonly checks?: readonly { readonly _zod: { readonly def: CheckDef } }[];
}

interface CheckDef {
  readonly check: string;
  readonly maximum?: number;
  readonly minimum?: number;
  readonly value?: number;
  readonly inclusive?: boolean;
  readonly format?: string;
  readonly pattern?: RegExp;
}

export interface Constraints {
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly min?: number;
  readonly max?: number;
  readonly int: boolean;
  readonly pattern?: RegExp;
  readonly hasCustomCheck: boolean;
}

export function defOf(schema: z.ZodType): Def {
  return (schema as unknown as { _zod: { def: Def } })._zod.def;
}

export function unwrap(schema: z.ZodType): { readonly schema: z.ZodType; readonly optional: boolean } {
  let current = schema;
  let optional = false;
  while (defOf(current).type === 'optional') {
    optional = true;
    const inner = defOf(current).innerType;
    if (!inner) throw new Error('optional without innerType');
    current = inner;
  }
  return { schema: current, optional };
}

export function constraintsOf(schema: z.ZodType): Constraints {
  const result: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    int: boolean;
    pattern?: RegExp;
    hasCustomCheck: boolean;
  } = { int: false, hasCustomCheck: false };
  for (const check of defOf(schema).checks ?? []) {
    const def = check._zod.def;
    if (def.check === 'max_length') result.maxLength = def.maximum;
    else if (def.check === 'min_length') result.minLength = def.minimum;
    else if (def.check === 'greater_than' && def.inclusive) result.min = def.value;
    else if (def.check === 'less_than' && def.inclusive) result.max = def.value;
    else if (def.check === 'number_format' && def.format === 'safeint') result.int = true;
    else if (def.check === 'string_format' && def.format === 'regex') result.pattern = def.pattern;
    else if (def.check === 'custom') result.hasCustomCheck = true;
    else throw new Error(`schema-walk: unhandled check ${def.check}; extend constraintsOf`);
  }
  return result;
}

/** Label of each union option: the discriminator literal, or the option index for plain unions. */
export function unionOptionLabels(schema: z.ZodType): readonly string[] {
  const def = defOf(schema);
  const options = def.options ?? [];
  return options.map((option, index) => {
    if (!def.discriminator) return String(index);
    const literal = defOf(option).shape?.[def.discriminator];
    const values = literal ? defOf(literal).values : undefined;
    return values && values.length === 1 ? String(values[0]) : String(index);
  });
}

export type SharedNames = ReadonlyMap<z.ZodType, string>;

const OPAQUE_TYPES = new Set(['lazy', 'record', 'unknown', 'any']);

export interface SchemaNode {
  /** Schema with optional wrappers removed. */
  readonly schema: z.ZodType;
  readonly type: string;
  /** Normalised shape; restarts at a shared schema's name. */
  readonly shape: string;
  /** Shape of the field holding this node, before a shared schema restarts it. */
  readonly fieldShape: string;
  readonly optional: boolean;
}

/**
 * Visits every node of a schema once per shape. Recursion stops at lazy/record (JSON payloads)
 * and at shared schemas already visited, so recursive or reused schemas terminate.
 */
export function forEachSchemaNode(
  schema: z.ZodType,
  root: string,
  shared: SharedNames,
  visit: (node: SchemaNode) => void,
): void {
  const seen = new Set<string>();
  const go = (node: z.ZodType, fieldShape: string): void => {
    const { schema: s, optional } = unwrap(node);
    let shape = fieldShape;
    const sharedName = shared.get(s);
    if (sharedName !== undefined) {
      visit({ schema: s, type: defOf(s).type, shape: sharedName, fieldShape, optional });
      if (seen.has(sharedName)) return;
      seen.add(sharedName);
      shape = sharedName;
    } else {
      visit({ schema: s, type: defOf(s).type, shape, fieldShape, optional });
    }
    const def = defOf(s);
    if (def.type === 'object') {
      for (const [key, child] of Object.entries(def.shape ?? {})) go(child, `${shape}.${key}`);
    } else if (def.type === 'array' && def.element) {
      go(def.element, `${shape}[]`);
    } else if (def.type === 'tuple') {
      (def.items ?? []).forEach((item, index) => go(item, `${shape}[${index}]`));
    } else if (def.type === 'union') {
      const labels = unionOptionLabels(s);
      (def.options ?? []).forEach((option, index) => go(option, `${shape}<${labels[index]}>`));
    }
  };
  go(schema, root);
}

/**
 * Static expectations of a maximal instance: every optional key present (`key:`), every array
 * non-empty (`array:`), every discriminated-union option used (`option:`). Literal unions
 * (bond order 1|2|3) are values, not shapes.
 */
export function coverageExpectations(schema: z.ZodType, root: string, shared: SharedNames): Set<string> {
  const out = new Set<string>();
  forEachSchemaNode(schema, root, shared, (node) => {
    if (node.optional) out.add(`key:${node.fieldShape}`);
    if (node.type === 'array') out.add(`array:${node.shape}`);
    if (node.type === 'union' && defOf(node.schema).discriminator) {
      for (const label of unionOptionLabels(node.schema)) out.add(`option:${node.shape}<${label}>`);
    }
  });
  return out;
}

export interface VisitedNode {
  /** Schema with optional wrappers removed. */
  readonly schema: z.ZodType;
  readonly type: string;
  readonly value: unknown;
  readonly path: Path;
  readonly shape: string;
  /** Shape of the field holding this node, before a shared schema restarts it (`species.structure`). */
  readonly fieldShape: string;
  /** True when this node sits in an object key declared optional. */
  readonly optional: boolean;
  /** True when this node is an array element or tuple item (not an object key). */
  readonly inArray: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickUnionOption(schema: z.ZodType, value: unknown): number {
  const def = defOf(schema);
  const options = def.options ?? [];
  if (def.discriminator && isRecord(value)) {
    const labels = unionOptionLabels(schema);
    return labels.indexOf(String(value[def.discriminator]));
  }
  return options.findIndex((option) => option.safeParse(value).success);
}

/** Walks a (valid) value alongside its schema, visiting every schema-typed node. */
export function walkValue(
  schema: z.ZodType,
  value: unknown,
  root: string,
  shared: SharedNames,
  visit: (node: VisitedNode) => void,
): void {
  const go = (node: z.ZodType, v: unknown, path: Path, shape: string, inArray: boolean): void => {
    const { schema: s, optional } = unwrap(node);
    const fieldShape = shape;
    shape = shared.get(s) ?? shape;
    const def = defOf(s);
    visit({ schema: s, type: def.type, value: v, path, shape, fieldShape, optional, inArray });
    if (OPAQUE_TYPES.has(def.type)) return;
    if (def.type === 'object' && isRecord(v)) {
      for (const [key, child] of Object.entries(def.shape ?? {})) {
        if (Object.hasOwn(v, key)) go(child, v[key], [...path, key], `${shape}.${key}`, false);
      }
    } else if (def.type === 'array' && Array.isArray(v) && def.element) {
      const element = def.element;
      v.forEach((item, index) => go(element, item, [...path, index], `${shape}[]`, true));
    } else if (def.type === 'tuple' && Array.isArray(v)) {
      (def.items ?? []).forEach((item, index) => go(item, v[index], [...path, index], `${shape}[${index}]`, true));
    } else if (def.type === 'union') {
      const index = pickUnionOption(s, v);
      const option = (def.options ?? [])[index];
      if (option === undefined) throw new Error(`schema-walk: no union option matches at ${path.join('.')}`);
      go(option, v, path, `${shape}<${unionOptionLabels(s)[index]}>`, inArray);
    }
  };
  go(schema, value, [], root, false);
}

/** Observations of a value, in the vocabulary of `coverageExpectations`. */
export function coverageObservations(
  schema: z.ZodType,
  value: unknown,
  root: string,
  shared: SharedNames,
): Set<string> {
  const out = new Set<string>();
  walkValue(schema, value, root, shared, (node) => {
    if (node.optional) out.add(`key:${node.fieldShape}`);
    if (node.type === 'array' && Array.isArray(node.value) && node.value.length > 0) out.add(`array:${node.shape}`);
    if (node.shape.endsWith('>') && isRecord(node.value)) out.add(`option:${node.shape}`);
  });
  return out;
}

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function parentOf(root: unknown, path: Path): Record<string | number, unknown> {
  let current: unknown = root;
  for (const segment of path.slice(0, -1)) {
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current as Record<string | number, unknown>;
}

/** Returns a deep copy of `root` with the value at `path` replaced. */
export function withValueAt<T>(root: T, path: Path, value: unknown): T {
  const copy = cloneJson(root);
  if (path.length === 0) return value as T;
  const key = path[path.length - 1] as string | number;
  parentOf(copy, path)[key] = value;
  return copy;
}

/** Returns a deep copy of `root` with the object key at `path` removed. */
export function withoutKeyAt<T>(root: T, path: Path): T {
  const copy = cloneJson(root);
  const key = path[path.length - 1] as string | number;
  Reflect.deleteProperty(parentOf(copy, path), key);
  return copy;
}
