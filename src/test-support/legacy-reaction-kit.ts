/** Helpers for tests of the legacy reaction mapper (step 3.11a): raw legacy JSON → port → ID space → compounds → reactions → merged records. Test-only. */
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { createDocumentIds, mapLegacyCompounds, mapLegacyReactions, mergeMappedRecords, normalizeLegacyData, type HubDecision, type LegacyV5Data, type MappedCompounds, type MappedReactions, type MapReactionsOptions, type MergedMapping } from '@/io/legacy-v6';
import { FIXED_NOW, stateOfRecords } from './legacy-map-kit';

export interface MappedAll {
  readonly data: LegacyV5Data;
  readonly compounds: MappedCompounds;
  readonly reactions: MappedReactions;
  readonly merged: MergedMapping;
  readonly all: AnyRecord[];
}

/** Runs the whole chain; throws when a step refuses (tests only). */
export async function mapAll(raw: unknown, options: Partial<MapReactionsOptions> = {}, decisions?: ReadonlyMap<string, HubDecision>): Promise<MappedAll> {
  const normalized = normalizeLegacyData(raw);
  if (!normalized.ok) throw new Error(`port refused: ${normalized.code} ${normalized.message}`);
  const ids = createDocumentIds(normalized.data);
  const compounds = await mapLegacyCompounds(
    { data: normalized.data, dropped: normalized.dropped, assignedIds: normalized.assignedIds, ids },
    { now: () => FIXED_NOW, ...(decisions === undefined ? {} : { hubDecisions: decisions }) },
  );
  if (!compounds.ok) throw new Error(`compound mapper refused: ${compounds.code} ${compounds.message}`);
  const reactions = await mapLegacyReactions({ data: normalized.data, assignedIds: normalized.assignedIds, ids, compounds }, { now: () => FIXED_NOW, ...options });
  if (!reactions.ok) throw new Error(`reaction mapper refused: ${reactions.code} ${reactions.message}`);
  const merged = mergeMappedRecords(compounds, reactions);
  const all = Object.values(merged.records).flatMap((list) => [...(list ?? [])]);
  return { data: normalized.data, compounds, reactions, merged, all };
}

export const stateOf = (all: readonly AnyRecord[]): CanonicalState => stateOfRecords(all);
