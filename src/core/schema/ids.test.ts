/** ID scheme and kind registry — docs/DOMAIN_MODEL.md §1–§2, INV-01/02/03. */
import { describe, expect, it } from 'vitest';
import {
  ANY_ID_PATTERN,
  AnyIdSchema,
  idPattern,
  LAYER_OF_KIND,
  NESTED_ID_PREFIX,
  NESTED_ID_SPECS,
  OPERATIONAL_ID_PREFIX,
  RECORD_ID_PREFIX,
  RECORD_KINDS,
  RECORD_SCHEMAS,
  recordKindOfId,
  RecordCollectionsSchema,
} from './index';
import * as schema from './index';

const ALL_PREFIXES = [
  ...Object.values(RECORD_ID_PREFIX),
  ...Object.values(NESTED_ID_PREFIX),
  ...Object.values(OPERATIONAL_ID_PREFIX),
];

describe('ID prefixes', () => {
  it('are unique across record, nested and operational IDs', () => {
    expect(new Set(ALL_PREFIXES).size).toBe(ALL_PREFIXES.length);
  });

  it('are three lowercase letters', () => {
    for (const prefix of ALL_PREFIXES) expect(prefix).toMatch(/^[a-z]{3}$/);
  });

  it('cover every record kind with a layer, a schema and a collection', () => {
    const collections = Object.keys(RecordCollectionsSchema.shape);
    expect(collections).toEqual([...RECORD_KINDS]);
    for (const kind of RECORD_KINDS) {
      expect(RECORD_ID_PREFIX[kind]).toBeDefined();
      expect([1, 2, 3, 4, 5]).toContain(LAYER_OF_KIND[kind]);
      expect(RECORD_SCHEMAS[kind]).toBeDefined();
    }
  });

  it('declare every nested prefix at least once in NESTED_ID_SPECS', () => {
    const declared = new Set(NESTED_ID_SPECS.map((spec) => spec.prefix));
    for (const prefix of Object.values(NESTED_ID_PREFIX)) expect(declared.has(prefix), prefix).toBe(true);
  });
});

describe('ID body pattern', () => {
  const valid = ['rxn_ab', 'rxn_01j9z3k4m5n6p7q8r9s0t1v2w3', `rxn_${'a'.repeat(63)}`, 'spc_v6-c15', 'cls_1-alcohols'];
  const invalid = [
    'rxn_a', // body too short
    `rxn_${'a'.repeat(64)}`, // body too long
    'rxn_-ab', // leading dash
    'rxn_Ab', // uppercase
    'RXN_ab',
    'rx_ab',
    'rxnn_ab',
    'rxn-ab',
    'rxn_a b',
    'rxn_a_b',
    'rxn_ab\n',
    ' rxn_ab',
    'rxn_é1',
    '',
  ];

  it.each(valid)('accepts %s', (id) => {
    expect(ANY_ID_PATTERN.test(id)).toBe(true);
    expect(idPattern('rxn').test(id) || !id.startsWith('rxn_')).toBe(true);
    expect(AnyIdSchema.safeParse(id).success).toBe(true);
  });

  it.each(invalid)('rejects %j', (id) => {
    expect(AnyIdSchema.safeParse(id).success).toBe(false);
    expect(idPattern('rxn').test(id)).toBe(false);
  });
});

describe('typed ID schemas (INV-02)', () => {
  const typed = Object.entries(schema).filter(
    ([name, value]) => name.endsWith('IdSchema') && name !== 'AnyIdSchema' && typeof value === 'object',
  ) as [string, { safeParse: (v: unknown) => { success: boolean } }][];

  it('exist for every record and nested kind plus import batches', () => {
    expect(typed.length).toBe(RECORD_KINDS.length + Object.keys(NESTED_ID_PREFIX).length + 1);
  });

  it('each accept exactly one prefix', () => {
    for (const [name, idSchema] of typed) {
      const accepted = ALL_PREFIXES.filter((prefix) => idSchema.safeParse(`${prefix}_ab`).success);
      expect(accepted, name).toHaveLength(1);
    }
  });
});

describe('recordKindOfId', () => {
  it('maps every record prefix to its kind', () => {
    for (const kind of RECORD_KINDS) expect(recordKindOfId(`${RECORD_ID_PREFIX[kind]}_ab`)).toBe(kind);
  });

  it('returns undefined for nested, operational and malformed IDs', () => {
    for (const prefix of [...Object.values(NESTED_ID_PREFIX), ...Object.values(OPERATIONAL_ID_PREFIX)]) {
      expect(recordKindOfId(`${prefix}_ab`)).toBeUndefined();
    }
    expect(recordKindOfId('rxn_A')).toBeUndefined();
    expect(recordKindOfId('xyz_ab')).toBeUndefined();
  });
});
