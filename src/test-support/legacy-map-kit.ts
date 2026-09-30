/** Helpers for tests of the legacy compound mapper (step 3.10): run a legacy document through the port and the mapper, build a state from the result. Test-only. */
import { emptyRecordTables, type AnyRecord, type CanonicalState } from '@/core/schema';
import {
  createDocumentIds,
  mapLegacyCompounds,
  normalizeLegacyData,
  type HubDecision,
  type LegacyV5Data,
  type MapCompoundsOptions,
  type MappedCompounds,
} from '@/io/legacy-v6';

export const FIXED_NOW = '2026-09-30T00:00:00.000Z';

export interface MappedFixture {
  readonly data: LegacyV5Data;
  readonly normalized: Extract<ReturnType<typeof normalizeLegacyData>, { ok: true }>;
  readonly mapped: MappedCompounds;
}

/** Raw legacy JSON (v4 or v5) → port → ID space → mapped compounds. Throws when a step refuses (tests only). */
export async function mapLegacy(raw: unknown, options: Partial<MapCompoundsOptions> = {}, decisions?: ReadonlyMap<string, HubDecision>): Promise<MappedFixture> {
  const normalized = normalizeLegacyData(raw);
  if (!normalized.ok) throw new Error(`port refused: ${normalized.code} ${normalized.message}`);
  const ids = createDocumentIds(normalized.data);
  const mapped = await mapLegacyCompounds(
    { data: normalized.data, dropped: normalized.dropped, assignedIds: normalized.assignedIds, ids },
    { now: () => FIXED_NOW, ...(decisions === undefined ? {} : { hubDecisions: decisions }), ...options },
  );
  if (!mapped.ok) throw new Error(`mapper refused: ${mapped.code} ${mapped.message}`);
  return { data: normalized.data, normalized, mapped };
}

export const allRecords = (mapped: MappedCompounds): AnyRecord[] => [
  ...mapped.records.species,
  ...mapped.records.class,
  ...mapped.records.navigator_anchor,
  ...mapped.records.entity_display,
  ...mapped.records.asset,
];

/** A canonical state holding exactly the mapped records (for the L2/L3 validator). */
export function stateOfRecords(records: readonly AnyRecord[]): CanonicalState {
  const tables = emptyRecordTables() as unknown as Record<string, Record<string, AnyRecord>>;
  for (const record of records) (tables[record.kind] as Record<string, AnyRecord>)[record.id] = record;
  return { meta: { datasetId: 'legacy-map-test', title: 'Legacy map test', createdAt: FIXED_NOW, updatedAt: FIXED_NOW }, records: tables as unknown as CanonicalState['records'] };
}
