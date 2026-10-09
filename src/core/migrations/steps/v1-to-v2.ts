import type { SchemaMigration } from '../contracts';

/**
 * Schema version 1 to 2 (step 5.5c; ADR-037). Version 2 adds three OPTIONAL fields to `navigator_anchor` (`cell`, `group`, `tone`),
 * so every version 1 document is already a valid version 2 document: the step changes the version number and nothing else. No record
 * changes, so the report lists none.
 */
export const migrateV1ToV2: SchemaMigration = {
  from: 1,
  to: 2,
  description: 'navigator_anchor gains optional cell, group and tone (presentation); no record changes',
  migrate(doc) {
    return {
      doc: { ...doc, schemaVersion: 2 },
      report: {
        from: 1,
        to: 2,
        description: 'schema version 2: optional arrangement fields on navigator_anchor; no record changed',
        changedRecordIds: [],
        notes: [],
      },
    };
  },
};
