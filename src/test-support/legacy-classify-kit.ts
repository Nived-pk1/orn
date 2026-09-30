/** Helpers for tests of the legacy classification mapper (step 3.11b): the whole chain port → IDs → compounds → reactions → classification, and the demo dataset as a match context. Test-only. */
import { readFileSync } from 'node:fs';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import {
  createDocumentIds,
  mapLegacyClassification,
  mapLegacyCompounds,
  mapLegacyReactions,
  matchContextFromRecords,
  mergeAllMappedRecords,
  normalizeLegacyData,
  type HubDecision,
  type LegacyMatchContext,
  type LegacyV5Data,
  type MapClassificationOptions,
  type MappedClassification,
  type MappedCompounds,
  type MappedReactions,
  type MergedMapping,
} from '@/io/legacy-v6';
import { FIXED_NOW, stateOfRecords } from './legacy-map-kit';
import type { LegacyDocumentIds, ReportBuilder } from '@/io/legacy-v6';

export interface ClassifiedAll {
  readonly normalized: Extract<ReturnType<typeof normalizeLegacyData>, { ok: true }>;
  readonly data: LegacyV5Data;
  readonly ids: LegacyDocumentIds;
  readonly compounds: MappedCompounds;
  readonly reactions: MappedReactions;
  readonly classification: MappedClassification;
  readonly merged: MergedMapping;
  readonly all: AnyRecord[];
  readonly report: ReportBuilder;
}

export interface ChainOptions {
  readonly context?: LegacyMatchContext;
  readonly decisions?: ReadonlyMap<string, HubDecision>;
  readonly classify?: Partial<MapClassificationOptions>;
}

/** Runs the whole chain with ONE shared report; throws when a step refuses (tests only). */
export async function mapClassified(raw: unknown, options: ChainOptions = {}): Promise<ClassifiedAll> {
  const normalized = normalizeLegacyData(raw);
  if (!normalized.ok) throw new Error(`port refused: ${normalized.code} ${normalized.message}`);
  const ids = createDocumentIds(normalized.data);
  const { createReportBuilder, LEGACY_V5_SCHEMA_VERSION } = await import('@/io/legacy-v6');
  const report = createReportBuilder(LEGACY_V5_SCHEMA_VERSION);
  const compounds = await mapLegacyCompounds(
    { data: normalized.data, dropped: normalized.dropped, assignedIds: normalized.assignedIds, ids },
    { now: () => FIXED_NOW, report, ...(options.decisions === undefined ? {} : { hubDecisions: options.decisions }) },
  );
  if (!compounds.ok) throw new Error(`compound mapper refused: ${compounds.code} ${compounds.message}`);
  const reactions = await mapLegacyReactions({ data: normalized.data, assignedIds: normalized.assignedIds, ids, compounds }, { now: () => FIXED_NOW, report });
  if (!reactions.ok) throw new Error(`reaction mapper refused: ${reactions.code} ${reactions.message}`);
  const classification = mapLegacyClassification(
    { data: normalized.data, ids, compounds, reactions },
    { now: () => FIXED_NOW, report, ...(options.context === undefined ? {} : { context: options.context }), ...options.classify },
  );
  if (!classification.ok) throw new Error(`classification mapper refused: ${classification.code} ${classification.message}`);
  const merged = mergeAllMappedRecords(compounds, reactions, classification);
  const all = Object.values(merged.records).flatMap((list) => [...(list ?? [])]);
  return { normalized, data: normalized.data, ids, compounds, reactions, classification, merged, all, report };
}

/** The records of `data/seed/demo.orn.json` (the live dataset a legacy import is matched against and merged with). */
export function demoRecords(): AnyRecord[] {
  const doc = JSON.parse(readFileSync(new URL('../../data/seed/demo.orn.json', import.meta.url), 'utf8')) as { records: Record<string, AnyRecord[]> };
  return Object.values(doc.records).flat();
}

/** The demo dataset as a match context. */
export const demoContext = (): LegacyMatchContext => matchContextFromRecords(demoRecords());

/** A state of the demo dataset plus the mapped records (the merged replica the import pipeline validates). */
export const stateWithDemo = (all: readonly AnyRecord[]): CanonicalState => stateOfRecords([...demoRecords(), ...all]);
