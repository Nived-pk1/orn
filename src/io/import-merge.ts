/**
 * The merged replica (docs/PERSISTENCE.md §6): what the dataset WOULD be after the plan, built without touching live state
 * (INV-21). `merge` starts from the live records and adds/replaces/copies the incoming ones; `replace_all` is the incoming
 * records alone with the file's own dataset meta. `import_as_copy` gives the record and its nested IDs new IDs from the
 * injected factory (reused across revisions of one plan so a preview does not shuffle IDs), then rewires EVERY written record's
 * references (the reference engine's `remap`) and rich-text `[[id]]` links to them. The result is pure data; the same function
 * feeds the preview's validation and the apply, so what is applied is exactly what was shown.
 */
import { freeze } from 'immer';
import type { IdFactory } from '@/core/dataset';
import { referenceEngine, rewriteRecordRichTextLinks } from '@/core/references';
import { DatasetMetaSchema, RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind } from '@/core/schema';
import type { ImportAssetSummary, ImportParseResult, ParsedAsset } from './contracts';
import type { ConflictAnalysis } from './import-conflicts';
import type { ResolvedRequest } from './import-request';

export interface MergeInput {
  readonly live: CanonicalState;
  readonly parsed: ImportParseResult;
  readonly analysis: ConflictAnalysis;
  readonly request: ResolvedRequest;
  /** old ID → new ID for `import_as_copy`; new entries are added here so a revised plan keeps the IDs already shown. */
  readonly copyIds: Map<string, string>;
  readonly ids: IdFactory;
}

export type MergeOutcome =
  | {
      readonly ok: true;
      readonly state: CanonicalState;
      readonly copyIdMap: readonly { readonly from: string; readonly to: string }[];
      readonly richTextLinksRewritten: number;
      /** Verified asset bytes to write with their records (final IDs), in record order. */
      readonly stagedAssets: readonly ParsedAsset[];
      readonly assets: ImportAssetSummary;
    }
  | { readonly ok: false; readonly code: 'INVALID_META'; readonly message: string };

const prefixOf = (id: string): string => id.slice(0, 3);

function copyIdFor(input: MergeInput, id: string, into: Map<string, string>): void {
  let next = input.copyIds.get(id);
  if (next === undefined) {
    next = input.ids.newId(prefixOf(id));
    input.copyIds.set(id, next);
  }
  into.set(id, next);
}

function buildIdMap(input: MergeInput, included: readonly AnyRecord[]): ReadonlyMap<string, string> {
  const idMap = new Map<string, string>();
  for (const record of included) {
    if (input.request.resolutions.get(record.id) !== 'import_as_copy') continue;
    copyIdFor(input, record.id, idMap);
    for (const nested of referenceEngine.nestedIds(record)) copyIdFor(input, nested.id, idMap);
  }
  return idMap;
}

interface Written {
  readonly record: AnyRecord;
  /** The ID the record has in the file. */
  readonly sourceId: string;
  /** How it meets the live dataset: brand new, replaces a live record, or is a copy under a new ID. */
  readonly how: 'new' | 'replace' | 'copy';
}

export function buildMergedReplica(input: MergeInput): MergeOutcome {
  const { live, parsed, analysis, request } = input;
  const included = analysis.incoming.filter((record) => !request.excluded.has(record.id));
  const idMap = request.mode === 'merge' ? buildIdMap(input, included) : new Map<string, string>();

  let meta = live.meta;
  if (request.mode === 'replace_all') {
    const checked = DatasetMetaSchema.safeParse(parsed.meta);
    if (!checked.success) {
      const first = checked.error.issues[0];
      const why = parsed.meta === undefined ? 'the file has no dataset meta' : `${first?.path.join('.') ?? 'meta'}: ${first?.message ?? 'invalid'}`;
      return { ok: false, code: 'INVALID_META', message: `replace_all needs the file's dataset meta, and it is unusable (${why})` };
    }
    meta = checked.data;
  }

  const tables = {} as Record<RecordKind, Record<string, AnyRecord>>;
  for (const kind of RECORD_KINDS) tables[kind] = request.mode === 'merge' ? { ...(live.records[kind] as Readonly<Record<string, AnyRecord>>) } : {};

  const written: Written[] = [];
  let richTextLinksRewritten = 0;
  for (const record of included) {
    const resolution = request.mode === 'merge' ? request.resolutions.get(record.id) : undefined;
    if (resolution === 'keep_current' || resolution === 'identical_skip') continue;
    const remapped = idMap.size === 0 ? record : referenceEngine.remap(record, idMap);
    const rewritten = rewriteRecordRichTextLinks(remapped, idMap);
    richTextLinksRewritten += rewritten.rewritten;
    tables[record.kind][rewritten.record.id] = rewritten.record;
    const how: Written['how'] = resolution === 'import_as_copy' ? 'copy' : resolution === 'replace' || (request.mode === 'replace_all' && liveHas(live, record)) ? 'replace' : 'new';
    written.push({ record: rewritten.record, sourceId: record.id, how });
  }

  const state = freeze({ meta, records: tables } as unknown as CanonicalState, true);
  const { stagedAssets, assets } = planAssets(input, written);
  const copyIdMap = [...idMap].map(([from, to]) => ({ from, to })).sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  return { ok: true, state, copyIdMap, richTextLinksRewritten, stagedAssets, assets };
}

function liveHas(live: CanonicalState, record: AnyRecord): boolean {
  return Object.hasOwn(live.records[record.kind] as Readonly<Record<string, AnyRecord>>, record.id);
}

/** Which verified byte payloads ride with a written asset record (Q1: same transaction), and what the preview tells about the rest. */
function planAssets(input: MergeInput, written: readonly Written[]): { readonly stagedAssets: readonly ParsedAsset[]; readonly assets: ImportAssetSummary } {
  const bytesBySourceId = new Map(input.parsed.assets.map((asset) => [String(asset.assetId), asset] as const));
  const liveAssets = input.live.records.asset as Readonly<Record<string, { readonly sha256: string } | undefined>>;
  const staged: ParsedAsset[] = [];
  const overwritten: string[] = [];
  let withoutBytes = 0;
  for (const { record, sourceId, how } of written) {
    if (record.kind !== 'asset') continue;
    const liveAsset = how === 'copy' ? undefined : liveAssets[record.id];
    const needsBytes = liveAsset === undefined || liveAsset.sha256 !== record.sha256;
    if (!needsBytes) continue; // the live record already has these bytes
    const bytes = bytesBySourceId.get(sourceId);
    if (bytes === undefined) {
      withoutBytes += 1;
      continue;
    }
    staged.push({ ...bytes, assetId: record.id });
    if (liveAsset !== undefined) overwritten.push(record.id);
  }
  return {
    stagedAssets: staged,
    assets: { toStore: staged.length, notStored: input.parsed.assets.length - staged.length, overwritten: overwritten.sort(), withoutBytes },
  };
}
