/** Which kinds have the shared Names type: found from the schemas, so a new kind with Names needs no change here. */
import { describe, expect, it } from 'vitest';
import { NamesSchema, RECORD_KINDS, RECORD_SCHEMAS } from '../schema';
import { NAMES_KINDS, hasNames, kindHasNames } from '.';

describe('NAMES_KINDS', () => {
  it('is exactly the kinds whose schema has a `names` field of the shared Names type', () => {
    const found = RECORD_KINDS.filter((kind) => {
      const shape = (RECORD_SCHEMAS[kind] as unknown as { shape: Record<string, unknown> }).shape;
      return Object.hasOwn(shape, 'names') && shape.names === NamesSchema;
    });
    expect([...NAMES_KINDS]).toEqual(found);
    expect(NAMES_KINDS.length).toBeGreaterThan(0);
    for (const kind of ['species', 'class', 'reagent']) expect(kindHasNames(kind)).toBe(true);
  });

  it('a kind without Names (a reaction, an exam) is not editable by the names editor', () => {
    expect(kindHasNames('reaction')).toBe(false);
    expect(kindHasNames('exam')).toBe(false);
    expect(kindHasNames('banana')).toBe(false);
  });

  it('hasNames reads the record\'s kind only', () => {
    expect(hasNames({ kind: 'species' })).toBe(true);
    expect(hasNames({ kind: 'reaction' })).toBe(false);
    expect(hasNames(undefined)).toBe(false);
  });
});
