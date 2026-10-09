/**
 * The frozen schema fixtures stay at the version they were written for (docs/MIGRATION.md §1). The invalid fixtures of version 1 are
 * checked against the CURRENT schema, so a test brings a version 1 document to the current version with the real migration step first
 * (1 to 2 changes nothing but the number); any other version is left alone, so a "newer version" fixture stays newer.
 */
import type { MigratableDocument } from '@/core/migrations/contracts';
import { migrateV1ToV2 } from '@/core/migrations/steps/v1-to-v2';

export function upgradeFrozenFixture(raw: unknown): unknown {
  if (typeof raw === 'object' && raw !== null && (raw as { schemaVersion?: unknown }).schemaVersion === 1) {
    return migrateV1ToV2.migrate(raw as MigratableDocument).doc;
  }
  return raw;
}
