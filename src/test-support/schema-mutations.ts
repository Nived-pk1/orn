/**
 * Schema-derived mutations of a valid value (docs/TEST_STRATEGY.md §2). Each mutation states
 * whether the schema must accept or reject the result, so the schema suite checks every cap,
 * ID pattern, enum, literal, required key and strictness rule without hand-written lists.
 */
import type { z } from 'zod';
import { PositiveNumberSchema } from '@/core/schema';
import {
  constraintsOf,
  defOf,
  type Path,
  type SharedNames,
  walkValue,
  withoutKeyAt,
  withValueAt,
} from './schema-walk';
import { MACHINE_STRING_SHAPES, SINGLE_LINE_TEXT, TEXT_SCHEMAS } from './schema-shapes';

export interface Mutation {
  readonly path: Path;
  readonly label: string;
  readonly expect: 'accept' | 'reject';
  readonly value: unknown;
}

/**
 * Shapes whose cap is enforced elsewhere, or whose value cannot be padded with filler characters:
 * StructureRep by a parent refinement, base64 by its alphabet (its cap is tested in primitives.test.ts).
 */
const PARENT_CAPPED_SHAPES = new Set(['StructureRep.value', 'document.embeddedAssets[].base64']);
/** Enum fields a parent refinement ties to a sibling (RecordRef kind ↔ id prefix); tested in refs.test.ts. */
const PARENT_BOUND_ENUMS = new Set(['RecordRef.kind']);

const ID_PATTERN_SOURCE = /^\^([a-z]{3})_/;

/** A key a UI might leak into a record (INV-10, ADV-029). */
export const INJECTED_KEY = 'selected';

function stringMutations(schema: z.ZodType, value: string, shape: string, fieldShape: string): [string, string, boolean][] {
  const c = constraintsOf(schema);
  const out: [string, string, boolean][] = [];
  const idPrefix = c.pattern ? ID_PATTERN_SOURCE.exec(c.pattern.source)?.[1] : undefined;
  if (idPrefix !== undefined) {
    const other = idPrefix === 'zzz' ? 'yyy' : 'zzz';
    out.push(['id: other prefix', `${other}${value.slice(3)}`, false]);
    out.push(['id: uppercase body', value.toUpperCase(), false]);
    out.push(['id: body of 63 chars', `${idPrefix}_${'a'.repeat(63)}`, true]);
    out.push(['id: body of 64 chars', `${idPrefix}_${'a'.repeat(64)}`, false]);
    out.push(['id: one-char body', `${idPrefix}_a`, false]);
    out.push(['id: leading dash', `${idPrefix}_-ab`, false]);
    out.push(['id: underscore in body', `${idPrefix}_a_b`, false]);
    return out;
  }
  if (c.pattern) {
    out.push(['pattern: empty', '', false]);
    out.push(['pattern: trailing space', `${value} `, false]);
    return out;
  }
  const text = TEXT_SCHEMAS.get(schema);
  if (text !== undefined) {
    const single = SINGLE_LINE_TEXT.has(text);
    out.push(['text: BEL control char', `${value}\u0007`, false]);
    out.push(['text: bidi override U+202E', `${value}‮`, false]);
    out.push(['text: bidi isolate U+2066', `${value}⁦`, false]);
    out.push(['text: DEL', `${value}\u007F`, false]);
    out.push(['text: newline', `${value}\nmore`, !single]);
    out.push(['text: tab', `${value}\tmore`, !single]);
    out.push(['text: blank', '   ', !single]);
    out.push(['text: markup is plain text', '<script>alert(1)</script> [[spc_x]] *b*', true]);
  } else if (!MACHINE_STRING_SHAPES.has(fieldShape) && !MACHINE_STRING_SHAPES.has(shape)) {
    throw new Error(`Unclassified string field ${fieldShape}: add it to TEXT or MACHINE_STRING shapes`);
  }
  if (c.maxLength !== undefined && !PARENT_CAPPED_SHAPES.has(fieldShape)) {
    const pad = (length: number) => value + 'x'.repeat(Math.max(0, length - value.length));
    out.push([`cap: length ${c.maxLength}`, pad(c.maxLength), true]);
    out.push([`cap: length ${c.maxLength + 1}`, pad(c.maxLength + 1), false]);
  }
  return out;
}

function numberMutations(schema: z.ZodType): [string, number, boolean][] {
  const c = constraintsOf(schema);
  const out: [string, number, boolean][] = [
    ['number: NaN', Number.NaN, false],
    ['number: Infinity', Number.POSITIVE_INFINITY, false],
    ['number: -Infinity', Number.NEGATIVE_INFINITY, false],
  ];
  if (c.min !== undefined) {
    out.push([`min: ${c.min}`, c.min, true], [`below min: ${c.min - 1}`, c.min - 1, false]);
  }
  if (c.max !== undefined) {
    out.push([`max: ${c.max}`, c.max, true], [`above max: ${c.max + 1}`, c.max + 1, false]);
  }
  if (c.int) out.push(['int: fractional', (c.min ?? 0) + 0.5, false]);
  if (schema === PositiveNumberSchema) {
    out.push(['positive: 0', 0, false], ['positive: -1', -1, false], ['positive: 0.5', 0.5, true]);
  }
  return out;
}

/** All mutations of `value` (valid under `schema`). */
export function schemaMutations(schema: z.ZodType, value: unknown, root: string, shared: SharedNames): Mutation[] {
  const mutations: Mutation[] = [];
  const add = (path: Path, label: string, accept: boolean, next: unknown) =>
    mutations.push({ path, label, expect: accept ? 'accept' : 'reject', value: next });
  const set = (path: Path, v: unknown) => withValueAt(value, path, v);

  walkValue(schema, value, root, shared, (node) => {
    const { path, schema: s, type } = node;
    const def = defOf(s);
    const isObjectKey = path.length > 0 && !node.inArray;
    if (isObjectKey && !node.optional && !node.fieldShape.endsWith('>')) {
      add(path, 'required key removed', false, withoutKeyAt(value, path));
    }
    if (type === 'object') {
      add(path, `unknown key "${INJECTED_KEY}"`, false, set(path, { ...(node.value as object), [INJECTED_KEY]: true }));
    } else if (type === 'array' && Array.isArray(node.value)) {
      const { maxLength } = constraintsOf(s);
      const first: unknown = node.value[0];
      if (maxLength !== undefined && first !== undefined) {
        add(path, `cap: ${maxLength} items`, true, set(path, Array.from({ length: maxLength }, () => first)));
        add(path, `cap: ${maxLength + 1} items`, false, set(path, Array.from({ length: maxLength + 1 }, () => first)));
      }
      add(path, 'array: not an array', false, set(path, {}));
    } else if (type === 'string' && typeof node.value === 'string') {
      for (const [label, next, accept] of stringMutations(s, node.value, node.shape, node.fieldShape)) {
        add(path, label, accept, set(path, next));
      }
      add(path, 'type: number instead of string', false, set(path, 1));
    } else if (type === 'number') {
      for (const [label, next, accept] of numberMutations(s)) add(path, label, accept, set(path, next));
      add(path, 'type: numeric string', false, set(path, String(node.value)));
    } else if (type === 'boolean') {
      add(path, 'type: string instead of boolean', false, set(path, 'true'));
    } else if (type === 'enum') {
      if (!PARENT_BOUND_ENUMS.has(node.fieldShape)) for (const option of Object.values(def.entries ?? {})) add(path, `enum: ${option}`, true, set(path, option));
      add(path, 'enum: unknown value', false, set(path, 'not_a_value'));
    } else if (type === 'literal') {
      add(path, 'literal: other value', false, set(path, `${String(node.value)}_other`));
    } else if (type === 'union' && def.discriminator) {
      add(path, 'union: unknown discriminator', false, set(path, { ...(node.value as object), [def.discriminator]: 'bogus' }));
    }
  });
  return mutations;
}
