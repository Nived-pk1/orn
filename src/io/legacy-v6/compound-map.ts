/**
 * v5 compounds → ORN records (step 3.10, docs/MIGRATION.md §4.4). Input is the 3.8 port's output (`data`, `dropped`, `assignedIds`)
 * plus the document's ID space, built FIRST by `createDocumentIds`. Output: species, classes (hubs decided as class, and classes
 * created for functional groups / `compoundClass` texts), navigator anchors (one per hub, in legacy order), entity displays
 * (`node: false`), assets (decoded images, with their bytes), the consumed-path trace and the compound side of the report.
 *
 * The mapper decides nothing silently: a value with no home goes to `provenance.legacy.unmapped`, a value that needs a person's
 * decision adds a review reason (which is also a report item), and the §4.8 rule applies to what the v4 → v5 port dropped. It never
 * throws for any parsed-JSON input, never reads the system clock (`options.now`), and is deterministic: the same input gives
 * byte-identical output. Every lookup is a Map; the work is linear in the number of compounds.
 */
import { IsoDateTimeSchema, LabelTextSchema, LIMITS, type Asset, type ChemicalClass, type EntityDisplay, type NavigatorAnchor, type RecordRef, type Species } from '@/core/schema';
import type { LegacyImportReport, ParsedAsset } from '../contracts';
import { planClasses, type HubClass } from './compound-classes';
import { canonicalNameOf, convertFields, KNOWN_COMPOUND_KEYS } from './compound-convert';
import { decodeLegacyImage, type DecodedImage } from './compound-image';
import { duplicatedIds, extraReasons, list } from './compound-review';
import { anchorRecord, assetRecord, classRecord, createdClassRecord, neverNodeRecord, provenanceOf, reviewOf, speciesRecord, type Stamp } from './compound-records';
import { createCompoundScope, excerpt, type CompoundScope } from './compound-scope';
import type { DroppedLeaf } from './dropped';
import { idKey, type LegacyDocumentIds } from './id-collect';
import { legacyAssetId } from './id-space';
import { LEGACY_V5_SCHEMA_VERSION } from './normalize';
import { createReportBuilder, type ReportBuilder } from './report';
import { generalizePath, createTrace, isEmptyLegacyValue } from './trace';
import type { LegacyV5Data } from './legacy-types';

export type HubDecision = 'class' | 'species';

export interface MapCompoundsInput {
  readonly data: LegacyV5Data;
  readonly dropped: readonly DroppedLeaf[];
  readonly assignedIds: readonly { readonly path: string; readonly id: string }[];
  readonly ids: LegacyDocumentIds;
}

export interface MapCompoundsOptions {
  /** Injected clock: a UTC ISO timestamp with `Z`, read once per run. */
  readonly now: () => string;
  /** The per-hub decision, keyed by the hub's key in the ID space (its legacy ID, except for a repeated ID). Default: `class`. */
  readonly hubDecisions?: ReadonlyMap<string, HubDecision>;
  /** Share one report with step 3.11's reaction mapping; a fresh one is made when absent. */
  readonly report?: ReportBuilder;
}

export interface HubInfo {
  readonly key: string;
  readonly legacyId: string;
  readonly name: string;
  readonly decision: HubDecision;
  readonly ref: RecordRef;
}

export interface MappedCompoundRecords {
  readonly species: Species[];
  readonly class: ChemicalClass[];
  readonly navigator_anchor: NavigatorAnchor[];
  readonly entity_display: EntityDisplay[];
  readonly asset: Asset[];
}

export interface MappedCompounds {
  readonly ok: true;
  readonly records: MappedCompoundRecords;
  /** Bytes of the decoded images, one per asset record (the import pipeline writes them with the record). */
  readonly assetBytes: readonly ParsedAsset[];
  readonly hubs: readonly HubInfo[];
  /** A legacy compound ID (as reactions refer to it) → the species or class it became (the first compound with that ID). */
  readonly refByLegacyId: ReadonlyMap<string, RecordRef>;
  /** Functional-group id → the class standing for it (a hub class or a created one). */
  readonly functionalGroupClass: ReadonlyMap<string, string>;
  /** Paths (`formatPath` spelling) of the legacy leaves that became schema fields. */
  readonly consumed: ReadonlySet<string>;
  readonly report: LegacyImportReport;
  /** Dropped leaves that do not belong to a compound (reactions, top level): step 3.11 handles them. */
  readonly unhandledDropped: readonly DroppedLeaf[];
}

export type MapCompoundsResult =
  | MappedCompounds
  | { readonly ok: false; readonly code: 'INVALID_CLOCK' | 'DUPLICATE_RECORD_ID'; readonly message: string; readonly ids?: readonly string[] };

const DROPPED_COMPOUND = /^compounds\[(\d+)\]\.?(.*)$/s;

interface PlannedCompound {
  readonly key: string;
  readonly legacyId: string;
  readonly hub: boolean;
  readonly decision: HubDecision;
  readonly kind: 'species' | 'class';
  readonly recordId: string;
  readonly ref: RecordRef;
}

export async function mapLegacyCompounds(input: MapCompoundsInput, options: MapCompoundsOptions): Promise<MapCompoundsResult> {
  const at = options.now();
  if (!IsoDateTimeSchema.safeParse(at).success) return { ok: false, code: 'INVALID_CLOCK', message: `the injected clock returned ${excerpt(at)}, not a UTC ISO-8601 timestamp` };
  const stamp: Stamp = { at };
  const { data, ids } = input;
  const compounds = data.compounds;
  const report = createReportBuilder(LEGACY_V5_SCHEMA_VERSION); // local: absorbed into `options.report` only when the run succeeds
  const trace = createTrace();
  const decisions = options.hubDecisions ?? new Map<string, HubDecision>();

  const planned: PlannedCompound[] = compounds.map((compound, index) => {
    const key = ids.compoundKeys[index] as string;
    const hub = compound.nodeType === 'major';
    const decision: HubDecision = hub ? (decisions.get(key) ?? 'class') : 'species';
    const kind = hub && decision === 'class' ? 'class' : 'species';
    const recordId = kind === 'class' ? ids.ids.classId(key) : ids.ids.speciesId(key);
    return { key, legacyId: idKey(compound.id), hub, decision, kind, recordId, ref: { kind, id: recordId } as RecordRef };
  });

  const hubClasses: HubClass[] = planned.flatMap((p, index) =>
    p.kind === 'class'
      ? [{ key: p.key, legacyId: p.legacyId, id: p.recordId, name: canonicalNameOf(compounds[index] ?? {}, index + 1), fgId: typeof compounds[index]?.fgId === 'string' ? (compounds[index]?.fgId as string) : '' }]
      : [],
  );
  const speciesIndexes = planned.flatMap((p, index) => (p.kind === 'species' ? [index] : []));
  const classPlan = planClasses(compounds, speciesIndexes, hubClasses, ids);

  const images = new Map<number, DecodedImage>();
  for (const [index, compound] of compounds.entries()) {
    if (typeof compound.image === 'string' && compound.image !== '') images.set(index, await decodeLegacyImage(compound.image));
  }

  const droppedOf = new Map<number, { sub: string; value: DroppedLeaf['value']; path: string }[]>();
  const unhandledDropped: DroppedLeaf[] = [];
  for (const leaf of input.dropped) {
    const match = DROPPED_COMPOUND.exec(leaf.path);
    const index = match === null ? -1 : Number(match[1]);
    if (match === null || index >= compounds.length || (match[2] ?? '') === '') {
      unhandledDropped.push(leaf);
    } else if (isEmptyLegacyValue(leaf.value)) {
      report.consumedByDefault(generalizePath(leaf.path));
    } else droppedOf.set(index, [...(droppedOf.get(index) ?? []), { sub: match[2] as string, value: leaf.value, path: leaf.path }]);
  }
  const missingId = new Map(input.assignedIds.flatMap((entry) => (/^compounds\[\d+\]\.id$/.test(entry.path) ? [[Number(/\d+/.exec(entry.path)?.[0]), entry.id] as const] : [])));

  const assets = new Map<string, Asset>();
  const assetBytes: ParsedAsset[] = [];
  const speciesOut: Species[] = [];
  const classOut: ChemicalClass[] = [];
  const anchors: NavigatorAnchor[] = [];
  const displays: EntityDisplay[] = [];
  const refByLegacyId = new Map<string, RecordRef>();
  const built: { index: number; name: string; make: (extraReasons: readonly string[]) => Species | ChemicalClass; scope: CompoundScope }[] = [];
  let hubOrdinal = 0;

  for (const [index, compound] of compounds.entries()) {
    const p = planned[index] as PlannedCompound;
    const scope = createCompoundScope(index, trace, report);
    if (!refByLegacyId.has(p.legacyId)) refByLegacyId.set(p.legacyId, p.ref);

    const idStored = typeof compound.id === 'string' && LabelTextSchema.safeParse(compound.id).success;
    if (idStored) scope.consume(['id'], compound.id);
    else {
      scope.keep(['id'], compound.id);
      scope.reason(`id ${excerpt(compound.id)} cannot be stored as a legacy id; kept in legacy.unmapped`);
    }
    const placeholder = missingId.get(index);
    if (placeholder !== undefined) scope.reason(`record had no id in the legacy file; the placeholder ${excerpt(placeholder)} was assigned`);
    if (p.key !== p.legacyId) scope.reason(`another compound has the legacy id ${excerpt(p.legacyId)}; v6 resolves references to the first, this record got its own ID`);
    const legacyId = idStored ? p.legacyId : undefined;

    const fields = convertFields(compound, p.kind, index + 1, scope);

    const unknown = Object.keys(compound).filter((key) => !KNOWN_COMPOUND_KEYS.has(key));
    for (const key of unknown) scope.keep([key], compound[key]);
    if (unknown.length > 0) scope.reason(`unknown legacy field(s) kept in legacy.unmapped: ${list(unknown.map((key) => excerpt(key, 30)))}`);

    const membership = classPlan.membership.get(index);
    if (membership !== undefined) {
      for (const entry of membership.consumed) scope.consume(entry.path as readonly (string | number)[], entry.value);
      for (const entry of membership.kept) scope.keep(entry.path, entry.value);
      for (const text of membership.reasons) scope.reason(text);
    } else {
      // A class is not a member of a class: the functional-group and class fields describe the hub itself.
      for (const key of ['fgId', 'functionalGroups', 'compoundClass'] as const) {
        const value = compound[key];
        if (value === undefined) continue;
        if (isEmptyLegacyValue(value)) scope.consume([key], value);
        else scope.keep([key], value);
      }
    }

    const image = compound.image;
    if (image !== undefined) {
      const decoded = images.get(index);
      if (decoded === undefined) {
        if (image === '' || image === null) scope.consume(['image'], image);
        else {
          scope.keep(['image'], image);
          scope.reason(`image is ${typeof image}, not a data: URL; kept in legacy.unmapped`);
        }
      } else if (!decoded.ok) {
        scope.keep(['image'], image);
        scope.reason(`image could not be imported (${decoded.reason}); kept in legacy.unmapped`);
      } else {
        const assetId = legacyAssetId(decoded.sha256);
        const existing = assets.get(assetId);
        if (existing !== undefined && existing.attachedTo.length >= LIMITS.attachments) {
          scope.keep(['image'], image);
          scope.reason(`the image already has ${LIMITS.attachments} attachments; kept in legacy.unmapped`);
        } else {
          if (existing === undefined) {
            assets.set(assetId, assetRecord(assetId, { mediaType: decoded.mediaType, byteSize: decoded.bytes.length, sha256: decoded.sha256 }, p.ref, stamp, legacyId));
            assetBytes.push({ assetId: assetId as ParsedAsset['assetId'], sha256: decoded.sha256, mediaType: decoded.mediaType, bytes: decoded.bytes });
          } else existing.attachedTo.push({ ref: p.ref });
          scope.consume(['image'], image);
        }
      }
    }

    for (const entry of droppedOf.get(index) ?? []) scope.keep(['dropped', entry.sub], entry.value);
    const droppedCount = droppedOf.get(index)?.length ?? 0;
    if (droppedCount > 0) scope.reason(`${droppedCount} legacy value(s) were changed or dropped by v6's own normalisation; the originals are kept in legacy.unmapped.dropped`);

    if (p.hub) anchors.push(anchorRecord(ids.ids.anchorId(p.key), p.ref, (hubOrdinal += 1), stamp, legacyId));
    if (fields.neverNode) displays.push(neverNodeRecord(ids.ids.displayId(p.key), p.ref, stamp, legacyId));
    if (p.hub && p.decision === 'species') scope.reason('hub treated as a species by decision; its anchor targets the species');

    built.push({
      index,
      name: fields.canonicalName,
      scope,
      make: (extra) => {
        const reasons = [...scope.reasons, ...extra];
        const unmapped = scope.unmapped();
        const parts = { id: p.recordId, fields, provenance: provenanceOf(stamp, legacyId, unmapped), review: reviewOf(reasons) };
        return p.kind === 'class' ? classRecord(parts) : speciesRecord(parts, classPlan.membership.get(index)?.classIds ?? []);
      },
    });
  }

  const names = built.map((item) => item.name);
  const extra = extraReasons(planned, names, ids.ids.collisions, classPlan.created);

  for (const item of built) {
    const record = item.make(extra.byCompound.get(item.index) ?? []);
    (record.kind === 'class' ? classOut : speciesOut).push(record as never);
    report.created(record.kind);
    for (const reason of [...item.scope.reasons, ...(extra.byCompound.get(item.index) ?? [])]) report.review({ kind: record.kind, id: record.id } as RecordRef, reason);
  }
  for (const created of classPlan.created) {
    const extraForClass = extra.byCreatedClass.get(created.id) ?? [];
    const legacy = LabelTextSchema.safeParse(created.origin).success ? created.origin : undefined;
    const record = createdClassRecord(created, stamp, legacy, extraForClass);
    classOut.push(record);
    report.created('class');
    for (const reason of [created.reason, ...extraForClass]) report.review({ kind: 'class', id: record.id } as RecordRef, reason);
  }
  for (const _anchor of anchors) report.created('navigator_anchor');
  for (const _display of displays) report.created('entity_display');
  for (const _asset of assets.values()) report.created('asset');

  // Last-resort guard: the ID space settles every clash it knows (id-space.ts), so this is not reachable from any input tried so far.
  const duplicated = duplicatedIds([...speciesOut, ...classOut, ...anchors, ...displays, ...assets.values()].map((record) => record.id as string));
  if (duplicated.length > 0) {
    return { ok: false, code: 'DUPLICATE_RECORD_ID', message: `two records of the mapped compounds got the same ID: ${list(duplicated)}; nothing was mapped`, ids: duplicated };
  }

  const compoundReport = report.build();
  options.report?.absorb(compoundReport);
  return {
    ok: true,
    records: { species: speciesOut, class: classOut, navigator_anchor: anchors, entity_display: displays, asset: [...assets.values()] },
    assetBytes,
    hubs: planned.flatMap((p, index) => (p.hub ? [{ key: p.key, legacyId: p.legacyId, name: canonicalNameOf(compounds[index] ?? {}, index + 1), decision: p.decision, ref: p.ref }] : [])),
    refByLegacyId,
    functionalGroupClass: classPlan.functionalGroupClass,
    consumed: trace.paths,
    report: compoundReport,
    unhandledDropped,
  };
}
