/**
 * The maximal fixture populates every field of every kind (docs/TEST_STRATEGY.md §2). Its
 * completeness is derived from the schema itself: every optional key present, every array
 * non-empty and every discriminated-union branch used somewhere. Adding a schema field without
 * extending the fixture fails here, which keeps the reference-registry coverage test meaningful.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { coverageExpectations, coverageObservations, walkValue } from '../../test-support/schema-walk';
import { SHARED_SCHEMAS } from '../../test-support/schema-shapes';
import { DatasetDocumentSchema, RECORD_KINDS, RECORD_SCHEMAS } from './index';

const fixturePath = new URL('../../../data/fixtures/schema/v1/maximal-valid.orn.json', import.meta.url);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  records: Record<string, { id: string }[]>;
};

/** Record schemas restart the shape at their kind, so paths read `reaction.participants[].ref`. */
const SHAPE_NAMES = new Map<z.ZodType, string>([
  ...SHARED_SCHEMAS,
  ...RECORD_KINDS.map((kind) => [RECORD_SCHEMAS[kind] as z.ZodType, kind] as const),
]);

describe('maximal valid fixture', () => {
  it('parses without any change (schemas validate, never transform — INV-24)', () => {
    expect(DatasetDocumentSchema.parse(fixture)).toEqual(fixture);
  });

  it('contains at least one record of every kind', () => {
    const empty = RECORD_KINDS.filter((kind) => (fixture.records[kind] ?? []).length === 0);
    expect(empty).toEqual([]);
  });

  it('populates every optional field, every array and every union branch', () => {
    const expected = coverageExpectations(DatasetDocumentSchema, 'document', SHAPE_NAMES);
    const observed = coverageObservations(DatasetDocumentSchema, fixture, 'document', SHAPE_NAMES);
    const missing = [...expected].filter((item) => !observed.has(item)).sort();
    expect(missing).toEqual([]);
    // Guard against a vacuous pass if the walker stops descending.
    expect(expected.size).toBeGreaterThan(300);
  });

  it('uses globally unique record and nested IDs (INV-01)', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    walkValue(DatasetDocumentSchema, fixture, 'document', SHAPE_NAMES, (node) => {
      if (node.path[node.path.length - 1] !== 'id' || typeof node.value !== 'string') return;
      if (/Ref(<[a-z_]+>)?\.id$/.test(node.shape)) return; // a reference, not a definition
      const where = node.path.join('.');
      if (seen.has(node.value)) duplicates.push(`${node.value} at ${where} and ${seen.get(node.value)}`);
      else seen.set(node.value, where);
    });
    expect(duplicates).toEqual([]);
    expect(seen.size).toBeGreaterThan(60);
  });

  it('lists records sorted by id within each collection (deterministic export order)', () => {
    for (const kind of RECORD_KINDS) {
      const ids = (fixture.records[kind] ?? []).map((record) => record.id);
      expect(ids, kind).toEqual([...ids].sort());
    }
  });
});
