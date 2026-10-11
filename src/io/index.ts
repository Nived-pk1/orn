export * from './contracts';
import type { convertLegacy as convertLegacyValue } from './import-legacy';
// The legacy importer is its own chunk (step 5.7, lazy loading): nothing here may import it statically, or it is bundled into the
// initial chunk. `convertLegacy` keeps its signature and loads the chunk on first call; the other legacy-v6 functions are imported
// from '@/io/legacy-v6' (their only users do) and only their types are re-exported here.
export const convertLegacy: typeof convertLegacyValue = async (input) => (await import('./import-legacy')).convertLegacy(input);
export type { LegacyConversion } from './import-legacy';
export { selectScope } from './export-scope';
export type { ScopeSelection } from './export-scope';
export { buildScopedDocument } from './export-document';
export type { ScopedDocumentBuildInfo, ScopedDocumentResult } from './export-document';
export { buildOrnJsonExport } from './export-json';
export type { OrnJsonExportDeps } from './export-json';
export { readAssetBytes } from './export-assets';
export type { AssetRead } from './export-assets';
export { buildOrnPackageExport } from './export-package';
export type { OrnPackageExportDeps } from './export-package';
export { scanJsonCaps } from './json-caps';
export type { CapScanLimits, CapScanResult } from './json-caps';
export { parseJsonSafely, sanitizeUnsafeKeys } from './safe-json';
export type { SafeJsonResult } from './safe-json';
export { detectFormat, looksLikeZip } from './format-detect';
export { magicBytesMatch } from './asset-magic';
export { unpackPackage } from './package-unpack';
export type { PackageUnpackOutcome, UnpackedPackage } from './package-unpack';
export { parseDatasetEnvelope } from './import-envelope';
export type { EnvelopeParseData, EnvelopeParseDeps, EnvelopeParseOutcome } from './import-envelope';
export { resolveAssets } from './asset-resolve';
export { parseImportSource } from './import-source';
export type { ImportParseDeps } from './import-source';
export { canonicalJson, canonicallyEqual } from './canonical-json';
export { analyzeConflicts } from './import-conflicts';
export type { ConflictAnalysis, ConflictEntry, KindCounts } from './import-conflicts';
export { resolveRequest } from './import-request';
export type { ResolvedRequest, ResolveRequestOutcome } from './import-request';
export { buildMergedReplica } from './import-merge';
export type { MergeInput, MergeOutcome } from './import-merge';
export { summarizeFindings, validateMerged } from './import-validate';
export type { MergedValidation, ValidateMergedOutcome } from './import-validate';
export { buildReportDraft, completeReport, quarantineDraftsOf, storeImportReport } from './import-apply';
export type { ImportQuarantineDraft, ImportReportDraft } from './import-apply';
export { prepareImportApply, STALE_MESSAGE } from './import-prepare';
export type { PrepareApplyOutcome, PreparedApply } from './import-prepare';
export { createImportSession } from './import-session';
export type { ImportSession, ImportSessionDeps, PreviewInput } from './import-session';
export type { AssetStagePort, ImportBatchRowLike, ImportBatchSink, ImportQuarantineRowLike, ImportStorePort, SnapshotPort } from './import-ports';
export type {
  DroppedLeaf,
  HubDecision,
  HubInfo,
  LegacyDocumentIds,
  MapCompoundsInput,
  MapCompoundsOptions,
  MapCompoundsResult,
  MappedCompounds,
  MapReactionsInput,
  MapReactionsOptions,
  MapReactionsResult,
  MappedReactions,
  MergedMapping,
  ReportBuilder,
  IdCollision,
  LegacyIdSpace,
  LegacyIdSpaceInput,
  LegacyNormalizeResult,
  LegacyRefusalCode,
  LegacyV5Data,
  ParsedConditions,
  ParsedLabel,
  ParseReview,
} from './legacy-v6';
