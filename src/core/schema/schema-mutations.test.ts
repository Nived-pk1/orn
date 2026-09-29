/**
 * Full L1 schema suite, derived from the schemas (docs/TEST_STRATEGY.md §2, VALIDATION_RULES.md L1).
 * Every record of the maximal fixture is mutated at every node: caps at and beyond the limit,
 * ID patterns and prefixes (INV-02), enums, literals, discriminators, required keys, type errors,
 * NaN/Infinity (ADV-037), control/bidi characters (ADV-034) and injected UI keys (INV-10, ADV-029).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { schemaMutations, type Mutation } from '../../test-support/schema-mutations';
import { SHARED_SCHEMAS } from '../../test-support/schema-shapes';
import { AnyRecordSchema, DatasetDocumentSchema, RECORD_KINDS, RECORD_SCHEMAS, type RecordKind } from './index';

// Resource limit, not an assertion: this file builds large datasets and loses its 5 s default under workstation contention (docs/PROGRESS.md, step 3.6 review).
vi.setConfig({ testTimeout: 30_000 });

const fixture = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/schema/v1/maximal-valid.orn.json', import.meta.url), 'utf8'),
) as { records: Record<RecordKind, Record<string, unknown>[]>; embeddedAssets: unknown[] } & Record<string, unknown>;

function failuresOf(schema: z.ZodType, mutations: readonly Mutation[]): string[] {
  const failures: string[] = [];
  for (const mutation of mutations) {
    const accepted = schema.safeParse(mutation.value).success;
    if (accepted !== (mutation.expect === 'accept')) {
      failures.push(`${mutation.path.join('.') || '(root)'}: ${mutation.label} should be ${mutation.expect}ed`);
    }
  }
  return failures;
}

describe.each(RECORD_KINDS)('schema mutations: %s', (kind) => {
  const schema = RECORD_SCHEMAS[kind] as z.ZodType;
  const records = fixture.records[kind];

  it('accepts every fixture record through its kind schema and the record union', () => {
    for (const record of records) {
      expect(schema.parse(record)).toEqual(record);
      expect(AnyRecordSchema.parse(record)).toEqual(record);
    }
  });

  it('accepts or rejects every schema-derived mutation as specified', () => {
    let total = 0;
    const failures: string[] = [];
    for (const record of records) {
      const mutations = schemaMutations(schema, record, kind, SHARED_SCHEMAS);
      total += mutations.length;
      failures.push(...failuresOf(schema, mutations).map((f) => `${String(record.id)} ${f}`));
    }
    expect(failures).toEqual([]);
    expect(total).toBeGreaterThan(20);
  });

  it('rejects the record under every other kind schema', () => {
    const [record] = records;
    const others = RECORD_KINDS.filter((other) => other !== kind && RECORD_SCHEMAS[other].safeParse(record).success);
    expect(others).toEqual([]);
  });
});

describe('schema mutations: dataset document envelope', () => {
  it('accepts or rejects every mutation of the document outside the records', () => {
    const records = Object.fromEntries(RECORD_KINDS.map((kind) => [kind, []]));
    const document = { ...fixture, records };
    const mutations = schemaMutations(DatasetDocumentSchema, document, 'document', SHARED_SCHEMAS);
    expect(failuresOf(DatasetDocumentSchema, mutations)).toEqual([]);
    expect(mutations.length).toBeGreaterThan(40);
  });
});
