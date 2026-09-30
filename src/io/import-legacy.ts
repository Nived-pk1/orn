/**
 * The legacy leg of the import session (docs/MIGRATION.md §4.3, IMPLEMENTATION_PLAN.md step 3.11c): the parsed v6/v4 JSON goes through
 * the port (3.8), the ID space (3.9), the compound (3.10), reaction (3.11a) and classification (3.11b) mappers and comes out as an
 * `ImportParseResult` of ORN records that the normal pipeline (conflicts, merged replica, validation, preview) takes over. Every mapped
 * record is checked with strict L1 again here; a record that fails would be quarantined, never dropped (none does today).
 *
 * The `LegacyMatchContext` is built from the LIVE state at preview time; the session's revision checks guard it going stale. Preview
 * decisions (hub class / species, one per distinct `reagentFamily` value) come from the mappers' output; the request is validated against
 * them AFTER the run (the hub list is a fact of the file). Deterministic: the clock is the injected one, IDs come from the ID space.
 * `reagentFamily` has no target field in the schema (a reaction has none; `Reagent.families` is a fixed vocabulary and `Reagent.classIds`
 * belongs to a reagent shared by many reactions), so its only option is `keep`: the value stays in `provenance.legacy.unmapped`.
 */
import type { AnyRecord, CanonicalState, RecordKind, RecordRef } from '@/core/schema';
import { validator } from '@/core/validation';
import type { ImportDecision, ImportParseResult, ImportPlanRequest, LegacyImportReport, QuarantinedItem } from './contracts';
import { quarantineRaw } from './import-envelope';
import { issueOf } from './l1-issues';
import {
  createDocumentIds,
  createReportBuilder,
  LEGACY_V5_SCHEMA_VERSION,
  mapLegacyClassification,
  mapLegacyCompounds,
  mapLegacyReactions,
  matchContextFromRecords,
  mergeAllMappedRecords,
  normalizeLegacyData,
  type HubDecision,
} from './legacy-v6';

export type LegacyConversion =
  | { readonly ok: true; readonly parsed: ImportParseResult; readonly report: LegacyImportReport; readonly decisions: readonly ImportDecision[] }
  | { readonly ok: false; readonly code: 'LEGACY_INVALID' | 'INVALID_REQUEST'; readonly message: string };

const HUB_PREFIX = 'hub:';
const FAMILY_PREFIX = 'reagent_family:';
const HUB_OPTIONS = ['class', 'species'] as const;

/** The live concepts, named reactions, topics and exams, as plain match data. */
function contextOf(live: CanonicalState) {
  const tables = live.records;
  return matchContextFromRecords([...Object.values(tables.concept), ...Object.values(tables.named_reaction), ...Object.values(tables.topic), ...Object.values(tables.exam)] as AnyRecord[]);
}

export async function convertLegacy(input: { readonly parsed: ImportParseResult; readonly live: CanonicalState; readonly now: () => string; readonly request: ImportPlanRequest | undefined }): Promise<LegacyConversion> {
  const { parsed, request } = input;
  const normalized = normalizeLegacyData(parsed.legacyPayload);
  if (!normalized.ok) return { ok: false, code: 'LEGACY_INVALID', message: `the legacy file cannot be converted: ${normalized.message}${normalized.path === '' ? '' : ` (at ${normalized.path})`}` };
  const at = input.now();
  const requested = new Map((request?.decisions ?? []).map((d) => [d.id, d.chosen] as const));
  const ids = createDocumentIds(normalized.data);
  const hubDecisions = new Map<string, HubDecision>();
  for (const [id, chosen] of requested) if (id.startsWith(HUB_PREFIX) && (chosen === 'class' || chosen === 'species')) hubDecisions.set(id.slice(HUB_PREFIX.length), chosen);

  const report = createReportBuilder(LEGACY_V5_SCHEMA_VERSION);
  const compounds = await mapLegacyCompounds({ data: normalized.data, dropped: normalized.dropped, assignedIds: normalized.assignedIds, ids }, { now: () => at, hubDecisions, report });
  if (!compounds.ok) return { ok: false, code: 'LEGACY_INVALID', message: compounds.message };
  const reactions = await mapLegacyReactions({ data: normalized.data, assignedIds: normalized.assignedIds, ids, compounds }, { now: () => at, report });
  if (!reactions.ok) return { ok: false, code: 'LEGACY_INVALID', message: reactions.message };
  const classification = mapLegacyClassification({ data: normalized.data, ids, compounds, reactions }, { now: () => at, context: contextOf(input.live), report });
  if (!classification.ok) return { ok: false, code: 'LEGACY_INVALID', message: classification.message };
  const merged = mergeAllMappedRecords(compounds, reactions, classification);

  // strict L1 on every mapped record (quarantine, never drop)
  const records: Partial<Record<RecordKind, AnyRecord[]>> = {};
  const counts: Partial<Record<RecordKind, number>> = {};
  const quarantined: QuarantinedItem[] = [];
  const failedAssets = new Set<string>();
  for (const [kind, list] of Object.entries(merged.records)) {
    for (const row of list ?? []) {
      const checked = validator.parseRecord(kind as RecordKind, row);
      if (!checked.ok) {
        if (kind === 'asset') failedAssets.add(row.id);
        quarantined.push({ claimedKind: kind, claimedId: row.id, issues: checked.findings.map(issueOf), ...quarantineRaw(row) });
        continue;
      }
      (records[checked.record.kind] ??= []).push(checked.record);
      counts[checked.record.kind] = (counts[checked.record.kind] ?? 0) + 1;
    }
  }

  // preview decisions: one per hub (class by default), one per distinct reagentFamily value (keep, the only option)
  const decisions: ImportDecision[] = compounds.hubs.map((hub) => ({
    id: `${HUB_PREFIX}${hub.key}`,
    subject: hub.ref,
    question: `Hub "${hub.name}" (legacy ${hub.legacyId}): a class of substances, or one specific species?`,
    options: [...HUB_OPTIONS],
    chosen: hub.decision,
  }));
  const firstWith = new Map<string, RecordRef>();
  normalized.data.reactions.forEach((reaction, index) => {
    const value = reaction.reagentFamily;
    if (value === undefined || value === '' || value === null) return;
    const text = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
    const record = classification.records.reaction[index];
    if (!firstWith.has(text) && record !== undefined) firstWith.set(text, { kind: 'reaction', id: record.id } as RecordRef);
  });
  for (const { value, count } of classification.reagentFamilies) {
    decisions.push({
      id: `${FAMILY_PREFIX}${value}`,
      subject: firstWith.get(value) as RecordRef,
      question: `Reagent family ${JSON.stringify(value)} (${count} reaction${count === 1 ? '' : 's'}; the subject is the first): the schema has no field for it, so it is kept in legacy.unmapped`,
      options: ['keep'],
      chosen: 'keep',
    });
  }
  const byId = new Map(decisions.map((d) => [d.id, d] as const));
  for (const [id, chosen] of requested) {
    const decision = byId.get(id);
    if (decision === undefined) return { ok: false, code: 'INVALID_REQUEST', message: `there is no decision ${JSON.stringify(id)} in this import` };
    if (!decision.options.includes(chosen)) return { ok: false, code: 'INVALID_REQUEST', message: `decision ${JSON.stringify(id)} has no option ${JSON.stringify(chosen)} (options: ${decision.options.join(', ')})` };
  }

  const built = report.build();
  const full: LegacyImportReport = {
    ...built,
    collisions: ids.ids.collisions.map((c) => ({ namespace: c.namespace, originals: [...c.originals], sharedPart: c.sharedPart, resolved: c.resolved.map((r) => ({ ...r })) })),
    unsafeKeysRenamed: parsed.unsafeKeysRenamed,
    decisions,
    reagentFamilies: classification.reagentFamilies,
    notImported: [...built.notImported, ...[...failedAssets].map((id) => ({ legacyId: id, reason: 'the asset record failed strict L1 and was quarantined' }))],
  };
  const assets = merged.assetBytes.filter((asset) => !failedAssets.has(asset.assetId));
  return {
    ok: true,
    parsed: { format: parsed.format, migrationsApplied: [], records, counts, quarantined, unsafeKeysRenamed: parsed.unsafeKeysRenamed, kindMismatches: [], assets, rejectedAssets: [], packageIssues: [] },
    report: full,
    decisions,
  };
}
