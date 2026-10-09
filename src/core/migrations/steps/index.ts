import type { SchemaMigration } from '../contracts';
import { migrateV1ToV2 } from './v1-to-v2';

/**
 * Registered schema migrations, one per version step (docs/MIGRATION.md §1–§3, CLAUDE.md §7). The chain runs from the document's
 * version up to CURRENT_SCHEMA_VERSION. 1 to 2: step 5.5c (optional arrangement fields on navigator_anchor).
 */
export const MIGRATIONS: readonly SchemaMigration[] = [migrateV1ToV2];
