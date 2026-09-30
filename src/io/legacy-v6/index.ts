/**
 * The legacy v6 data layer, ported (step 3.8; docs/MIGRATION.md §4.3 step 1): v4 prototype data and v5 data both come out as v5
 * data exactly as the v6 app's own `normalizeData` produces it (oracle fixtures in `data/fixtures/legacy/`). Pure: no clock, no
 * randomness, no I/O. Step 3.9 adds the deterministic ORN IDs (`createLegacyIdSpace`), the participant label parser (`parseLabel`) and
 * the condition parsers (`parseLegacyConditions`, `parseConditionField`). Step 3.10 maps the compounds (`createDocumentIds`, `mapLegacyCompounds`, the
 * report skeleton and the consumed-path trace); step 3.11a maps the reactions' participants, stages, outcomes, conditions, notes, images, scope and
 * lifecycle (`mapLegacyReactions`); the rest of the reaction fields is step 3.11b.
 */
import { findDroppedLeaves, type DroppedLeaf } from './dropped';
import type { LegacyV5Data } from './legacy-types';
import { normalizeData, type NormalizedLegacy } from './normalize';
import { isObj, LegacyRefusal } from './text';

export { autofillConditionFlags, splitLegacyReagent } from './conditions';
export type { SplitReagent } from './conditions';
export { findDroppedLeaves, formatPath } from './dropped';
export type { DroppedLeaf, LegacyScalar } from './dropped';
export { parseConditionField } from './condition-fields';
export type { ConditionField, FieldParse } from './condition-fields';
export { parseLegacyConditions } from './condition-parser';
export type { FlagTrace, ParsedConditions } from './condition-parser';
export { fgId, LEGACY_FG } from './fg-registry';
export { legacyPart, MAX_PART_LENGTH, resolveParts, sanitizeLegacyId } from './id-parts';
export type { IdCollision, ResolvedParts } from './id-parts';
export { createDocumentIds, idKey } from './id-collect';
export type { LegacyDocumentIds } from './id-collect';
export { createLegacyIdSpace, legacyAssetId } from './id-space';
export { mapLegacyCompounds } from './compound-map';
export type { HubDecision, HubInfo, MapCompoundsInput, MapCompoundsOptions, MapCompoundsResult, MappedCompoundRecords, MappedCompounds } from './compound-map';
export { DEFERRED_REACTION_FIELDS, mapLegacyReactions } from './reaction-map';
export type { MapReactionsInput, MapReactionsOptions, MapReactionsResult, MappedReactionRecords, MappedReactions } from './reaction-map';
export { mergeMappedRecords } from './merge-records';
export type { MergedMapping } from './merge-records';
export { createReportBuilder, LEGACY_SYSTEM } from './report';
export type { ReportBuilder } from './report';
export { createTrace, generalizePath, isEmptyLegacyValue } from './trace';
export type { ConsumedTrace } from './trace';
export { leavesOf } from './dropped';
export type { LegacyIdSpace, LegacyIdSpaceInput } from './id-space';
export { parseLabel } from './label-parser';
export type { LabelField, LabelKind, LabelToken, ParsedLabel } from './label-parser';
export type { ParseNote, ParseNoteCode, ParseReview, ParseReviewCode, Segment } from './parse-spans';
export { createCompoundNameLookup, LEGACY_REACTION_KEYS, migrateLegacy, migrateLegacyReaction } from './migrate';
export type { CompoundNameLookup, MigratedReaction } from './migrate';
export { LEGACY_V5_SCHEMA_VERSION } from './normalize';
export type { LegacyObject } from './text';
export type { LegacyV5Data } from './legacy-types';

export type LegacyRefusalCode = 'NOT_AN_OBJECT' | 'INVALID_RECORD' | 'INVALID_COMPOUND_NAME';

export type LegacyNormalizeResult =
  | {
      readonly ok: true;
      /** What v6's `normalizeData` returns for the same input, deep-equal (oracle tests). */
      readonly data: LegacyV5Data;
      /** Leaves of the input that `data` does not hold verbatim (path → value), so nothing is lost silently (INV-23). */
      readonly dropped: readonly DroppedLeaf[];
      /** Records that had no `id`: a deterministic placeholder was assigned (v6 used `Math.random`). */
      readonly assignedIds: readonly { readonly path: string; readonly id: string }[];
    }
  | { readonly ok: false; readonly code: LegacyRefusalCode; readonly message: string; readonly path: string };

/**
 * Legacy `normalizeData` for an already-parsed v4 or v5 document. Input that v6 would throw on (or build garbage from) is
 * refused as a value and nothing is converted. The input is never mutated (nested values it does not touch are shared).
 */
export function normalizeLegacyData(raw: unknown): LegacyNormalizeResult {
  if (!isObj(raw) || Array.isArray(raw)) {
    return { ok: false, code: 'NOT_AN_OBJECT', message: 'a legacy export is a JSON object with `compounds` and `reactions`; this value is not an object', path: '' };
  }
  let converted: NormalizedLegacy;
  try {
    converted = normalizeData(raw);
  } catch (error) {
    if (error instanceof LegacyRefusal) return { ok: false, code: error.code, message: error.message, path: error.path };
    throw error;
  }
  const data = converted.data as LegacyV5Data;
  return { ok: true, data, dropped: findDroppedLeaves(raw, data), assignedIds: converted.assignedIds };
}
