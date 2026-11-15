/**
 * The schema guard (step 8.4s, S6; audit DA-08): the files of src/core/schema have a fingerprint stored beside CURRENT_SCHEMA_VERSION. A
 * change to them without a new fingerprint fails `npm run check`, so a schema change cannot slip in without somebody deciding about the
 * version (an old build rejecting rows a newer schema wrote is what quarantined data in the audit).
 */
import { describe, expect, it } from 'vitest';
import { schemaFiles, schemaFingerprint } from '../../scripts/schema-fingerprint.mjs';
import { SCHEMA_FINGERPRINT } from '@/core/schema/fingerprint';

describe('the schema files and their fingerprint', () => {
  it('the files are the same as when the fingerprint was written', () => {
    expect(
      schemaFingerprint(),
      'Schema files changed: bump the schema version or update the fingerprint with a note in PROGRESS',
    ).toBe(SCHEMA_FINGERPRINT);
  });
  it('the fingerprint covers the schema files and not the tests or itself', () => {
    const names = schemaFiles();
    expect(names).toContain('dataset.ts');
    expect(names.some((name) => name.endsWith('.test.ts') || name === 'fingerprint.ts')).toBe(false);
  });
});
