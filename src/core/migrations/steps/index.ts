import type { SchemaMigration } from '../contracts';

/**
 * Registered schema migrations. Empty while CURRENT_SCHEMA_VERSION is 1; the first entry arrives
 * with the first schema bump (docs/MIGRATION.md §1–§3, CLAUDE.md §7).
 */
export const MIGRATIONS: readonly SchemaMigration[] = [];
