/**
 * The tolerant envelope -> migration -> per-record L1 -> quarantine pipeline (IMPLEMENTATION_PLAN.md §2
 * step 3.6). Real minimal-valid fixture rows stand in for "good" records; ADV-041's file part (a newer
 * schema is refused with an explanation) and an older one being migrated both use a synthetic runner
 * (no real schema bump exists yet, matching step 3.3's own pattern).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createMigrationRunner, migrationRunner } from '@/core/migrations';
import { CURRENT_SCHEMA_VERSION, DATASET_FORMAT, type DatasetDocument } from '@/core/schema';
import { SYNTHETIC_STEPS } from '@/test-support/synthetic-migration';
import { withVersionOffset } from '@/test-support/version-offset';
import { IMPORT_LIMITS } from './contracts';
import { parseDatasetEnvelope } from './import-envelope';

const fixture = JSON.parse(readFileSync(new URL('../../data/fixtures/schema/v2/minimal-valid.orn.json', import.meta.url), 'utf8')) as DatasetDocument;
const validSpecies = fixture.records.species;

function envelopeWith(records: Record<string, unknown[]>, schemaVersion = CURRENT_SCHEMA_VERSION) {
  return { format: DATASET_FORMAT, schemaVersion, records };
}

describe('parseDatasetEnvelope', () => {
  it('a value not shaped like an envelope is refused whole (INVALID_ENVELOPE)', () => {
    const result = parseDatasetEnvelope({ not: 'an envelope' }, { runner: migrationRunner });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_ENVELOPE' });
  });

  it('every good record passes L1 and lands under its own kind', () => {
    const result = parseDatasetEnvelope(envelopeWith({ species: validSpecies as unknown[] }), { runner: migrationRunner });
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.data.records.species?.length).toBe(validSpecies.length);
    expect(result.data.counts.species).toBe(validSpecies.length);
    expect(result.data.quarantined).toEqual([]);
  });

  it('INV-23 (quarantine on import): a record failing L1 is quarantined with its issues and raw value; the rest still import (one bad record never rejects the whole file)', () => {
    const bad = { kind: 'species', id: 'spc_bad' }; // missing every other required field
    const result = parseDatasetEnvelope(envelopeWith({ species: [...(validSpecies as unknown[]), bad] }), { runner: migrationRunner });
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.data.records.species?.length).toBe(validSpecies.length);
    expect(result.data.quarantined).toHaveLength(1);
    expect(result.data.quarantined[0]).toMatchObject({ claimedKind: 'species', claimedId: 'spc_bad' });
    expect(result.data.quarantined[0]?.issues.length).toBeGreaterThan(0);
    expect(result.data.quarantined[0]?.raw).toEqual(bad);
    expect(result.data.quarantined[0]?.rawTruncated).toBeUndefined();
  });

  it("a quarantined row's raw JSON text over the cap is truncated, with the true length reported (PERSISTENCE.md §7)", () => {
    const bad = { kind: 'species', id: 'spc_bad', names: { canonical: 'x'.repeat(IMPORT_LIMITS.maxQuarantineRawBytes) } };
    const result = parseDatasetEnvelope(envelopeWith({ species: [bad] }), { runner: migrationRunner });
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    const item = result.data.quarantined[0];
    expect(typeof item?.raw).toBe('string');
    expect((item?.raw as string).length).toBe(IMPORT_LIMITS.maxQuarantineRawBytes);
    expect(item?.rawTruncated?.originalChars).toBeGreaterThan(IMPORT_LIMITS.maxQuarantineRawBytes);
  });

  it('a row filed under an unrelated envelope key is still parsed by its OWN kind field, not the envelope grouping', () => {
    const misfiled = { junk: validSpecies as unknown[] };
    const result = parseDatasetEnvelope(envelopeWith(misfiled), { runner: migrationRunner });
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.data.records.species?.length).toBe(validSpecies.length);
  });

  it('more records than the cap is refused whole (TOO_MANY_RECORDS)', () => {
    const many = Array.from({ length: IMPORT_LIMITS.maxRecords + 1 }, (_, i) => ({ kind: 'concept', id: `cpt_${i}` }));
    const result = parseDatasetEnvelope(envelopeWith({ concept: many }), { runner: migrationRunner });
    expect(result).toMatchObject({ ok: false, code: 'TOO_MANY_RECORDS' });
  });

  it('ADV-041 file part: a newer schema version than the runner supports is refused with an explanation, nothing quarantined', () => {
    const runner = withVersionOffset(SYNTHETIC_STEPS, 1); // target 2
    const result = parseDatasetEnvelope(envelopeWith({}, 3), { runner });
    expect(result).toMatchObject({ ok: false, code: 'NEWER_SCHEMA', message: expect.any(String) });
  });

  it('an older schema version is migrated on the tolerant envelope before L1', () => {
    // withVersionOffset(steps, 1) exposes target 1 to the caller (docs on the helper): version 0 is "one
    // older", matching the synthetic step's meta.name -> meta.title.
    const runner = withVersionOffset(SYNTHETIC_STEPS, 1);
    const result = parseDatasetEnvelope({ ...envelopeWith({}, 0), meta: { name: 'Old title' } }, { runner });
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.data.detectedSchemaVersion).toBe(0);
    expect(result.data.migrationsApplied.length).toBeGreaterThan(0);
    expect(result.data.meta).toMatchObject({ title: 'Old title' }); // the synthetic step renames meta.name -> meta.title
  });

  it('a version the real runner rejects outright (e.g. 0) is a migration failure, not a generic envelope rejection', () => {
    // The envelope check accepts any number (see this file's header comment); INVALID_VERSION is the real
    // runner's own reason, more specific than a flat "not shaped like an ORN dataset".
    const result = parseDatasetEnvelope(envelopeWith({}, 0), { runner: migrationRunner });
    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_FAILED', message: expect.any(String) });
  });

  it('a version with no registered path to the target is a migration failure, not a crash', () => {
    const step = { from: 5, to: 6, description: 'unrelated gap step', migrate: (doc: { schemaVersion: number }) => ({ doc: { ...doc, schemaVersion: 6 }, report: { from: 5, to: 6, description: 'x', changedRecordIds: [], notes: [] } }) };
    const runner = createMigrationRunner([step] as never, 6);
    const result = parseDatasetEnvelope(envelopeWith({}, 1), { runner }); // version 1: no step registered from 1
    expect(result).toMatchObject({ ok: false, code: 'MIGRATION_FAILED' });
  });

  it('top-level meta (outside the envelope schema) is carried through unvalidated', () => {
    const value = { ...envelopeWith({}), meta: { datasetId: 'x', title: 'Untitled' } };
    const result = parseDatasetEnvelope(value, { runner: migrationRunner });
    if (!result.ok) throw new Error(`expected ok: ${result.message}`);
    expect(result.data.meta).toEqual({ datasetId: 'x', title: 'Untitled' });
  });
});
