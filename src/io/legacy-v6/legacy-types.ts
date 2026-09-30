/** The v5 document shape the legacy mapper works on (what `normalizeLegacyData` returns as `data`). */
import type { LEGACY_V5_SCHEMA_VERSION } from './normalize';
import type { LegacyObject } from './text';

export interface LegacyV5Data extends LegacyObject {
  readonly compounds: readonly LegacyObject[];
  readonly reactions: readonly LegacyObject[];
  readonly schemaVersion: typeof LEGACY_V5_SCHEMA_VERSION;
}
