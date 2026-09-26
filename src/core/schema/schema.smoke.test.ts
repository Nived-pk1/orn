/**
 * Phase 0 smoke test for the canonical schema. Extended in Phase 1 by the full schema suite
 * (docs/TEST_STRATEGY.md §3). Run: npm test -- src/core/schema
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DatasetDocumentSchema,
  NameTextSchema,
  RecordRefSchema,
  SafeUrlSchema,
  SpeciesSchema,
  StructureRepSchema,
} from './index';

const fixture = JSON.parse(
  readFileSync(new URL('../../../data/fixtures/schema/v1/minimal-valid.orn.json', import.meta.url), 'utf8'),
) as { records: { species: Record<string, unknown>[] } };

describe('canonical schema smoke test', () => {
  it('accepts the minimal valid dataset without changing it', () => {
    const parsed = DatasetDocumentSchema.parse(fixture);
    expect(parsed).toEqual(fixture);
  });

  it('rejects unknown keys, so UI state cannot leak into records (INV-10)', () => {
    const species = fixture.records.species[0];
    expect(SpeciesSchema.safeParse({ ...species, expanded: true }).success).toBe(false);
  });

  it('rejects IDs whose prefix does not match the kind (INV-02)', () => {
    expect(RecordRefSchema.safeParse({ kind: 'species', id: 'rxn_abc' }).success).toBe(false);
  });

  it('enforces text and structure caps and safe URLs (SECURITY.md §3)', () => {
    expect(NameTextSchema.safeParse('Eth\u202Eanol').success).toBe(false);
    expect(SafeUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(StructureRepSchema.safeParse({ format: 'smiles', value: 'C'.repeat(20_001) }).success).toBe(false);
  });
});
