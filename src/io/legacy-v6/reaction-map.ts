/**
 * v5 reactions → ORN records, part 1 (step 3.11a, docs/MIGRATION.md §4.5): the reaction record with its participants, stages,
 * the one outcome, intermediates, conditions (the step 3.9 parsers), notes, images, scope and lifecycle, plus the reagents and
 * species the reactions need (placeholders for missing compounds, records created from labels). Input: the 3.8 port's output, the
 * document's ID space and the 3.10 compound result (`refByLegacyId` resolves references to the species or class each compound
 * became, whatever the hub decision was).
 *
 * The classification and curriculum fields (transformation, mechanism, reactionType, reactionFamily, reagentFamily,
 * namedReaction, chapter, jee, relatedReactions, collapseIntermediates, `_v4`) belong to step 3.11b: they are NOT mapped and NOT
 * skipped silently - every leaf under them is returned in `deferred`. Any other unknown field is kept in
 * `provenance.legacy.unmapped` with a review reason. Deterministic (injected clock, no randomness), bounded (Map lookups; work
 * linear in the size of the document), total (never throws for parsed JSON).
 */
import { IsoDateTimeSchema, LabelTextSchema, NameTextSchema, type Asset, type Reaction, type Reagent, type RecordRef, type Species } from '@/core/schema';
import type { LegacyImportReport, ParsedAsset } from '../contracts';
import { collisionReason, duplicatedIds, list } from './compound-review';
import type { MappedCompounds } from './compound-map';
import { keepOnly, tagsOf } from './compound-convert';
import { provenanceOf, reviewOf, type Stamp } from './compound-records';
import { createScope, excerpt } from './compound-scope';
import { leavesOf, formatPath, type DroppedLeaf } from './dropped';
import { idKey, type LegacyDocumentIds } from './id-collect';
import { LEGACY_V5_SCHEMA_VERSION } from './normalize';
import { createAssetBook } from './reaction-assets';
import { emptyParameters, mapConditions } from './reaction-conditions';
import { mapParticipants } from './reaction-participants';
import { createSubstanceBook } from './reaction-substances';
import { createReportBuilder, type ReportBuilder } from './report';
import { createTrace } from './trace';
import type { LegacyV5Data } from './legacy-types';

/** The reaction fields step 3.11b maps. They are returned as `deferred` leaf paths, never skipped silently. */
export const DEFERRED_REACTION_FIELDS: readonly string[] = [
  'transformation', 'mechanism', 'reactionType', 'reactionFamily', 'reagentFamily', 'namedReaction', 'chapter', 'jee', 'relatedReactions', 'collapseIntermediates', '_v4',
];
/** The reaction fields this step reads. */
const MAPPED_KEYS: ReadonlySet<string> = new Set(['id', 'name', 'tags', 'image', 'participants', 'conditions']);

export interface MapReactionsInput {
  readonly data: LegacyV5Data;
  readonly assignedIds: readonly { readonly path: string; readonly id: string }[];
  readonly ids: LegacyDocumentIds;
  /** The 3.10 result: references resolve through it, its assets are reused (never mutated), its `unhandledDropped` is passed on. */
  readonly compounds: MappedCompounds;
}

export interface MapReactionsOptions {
  /** Injected clock: a UTC ISO timestamp with `Z`, read once per run. */
  readonly now: () => string;
  /** Share one report with the compound mapping; a fresh one is made when absent. Absorbed only when the run succeeds. */
  readonly report?: ReportBuilder;
}

export interface MappedReactionRecords {
  readonly reaction: Reaction[];
  readonly reagent: Reagent[];
  /** Placeholders and species created from labels (the compound species are in the 3.10 result). */
  readonly species: Species[];
  /** Assets the reactions created; images shared with a compound are in `updatedAssets` instead. */
  readonly asset: Asset[];
}

export interface MappedReactions {
  readonly ok: true;
  readonly records: MappedReactionRecords;
  /** Compound assets that gained a reaction attachment: a changed copy each, same ID (see `mergeMappedRecords`). */
  readonly updatedAssets: readonly Asset[];
  readonly assetBytes: readonly ParsedAsset[];
  /** Leaf paths (`reactions[3].jee.traps[0]`) of the fields that step 3.11b maps. */
  readonly deferred: readonly string[];
  /** Legacy leaf paths that became schema fields. */
  readonly consumed: ReadonlySet<string>;
  /** A legacy reaction ID → the reaction it became (the first with that ID, as v6 resolves it). For step 3.11b's relatedReactions. */
  readonly refByLegacyReactionId: ReadonlyMap<string, RecordRef>;
  readonly report: LegacyImportReport;
  /** Dropped leaves of the v4 → v5 port that are not under a compound (reactions, top level): step 3.11b handles them. */
  readonly unhandledDropped: readonly DroppedLeaf[];
}

export type MapReactionsResult =
  | MappedReactions
  | { readonly ok: false; readonly code: 'INVALID_CLOCK' | 'DUPLICATE_RECORD_ID'; readonly message: string; readonly ids?: readonly string[] };

export async function mapLegacyReactions(input: MapReactionsInput, options: MapReactionsOptions): Promise<MapReactionsResult> {
  const at = options.now();
  if (!IsoDateTimeSchema.safeParse(at).success) return { ok: false, code: 'INVALID_CLOCK', message: `the injected clock returned ${excerpt(at)}, not a UTC ISO-8601 timestamp` };
  const stamp: Stamp = { at };
  const { data, ids, compounds } = input;
  const report = createReportBuilder(LEGACY_V5_SCHEMA_VERSION); // absorbed into `options.report` only when the run succeeds
  const trace = createTrace();
  const substances = createSubstanceBook({ ids, compounds, stamp });
  const assets = createAssetBook(compounds.records.asset, stamp);
  const missingId = new Map(input.assignedIds.flatMap((entry) => (/^reactions\[\d+\]\.id$/.test(entry.path) ? [[Number(/\d+/.exec(entry.path)?.[0]), entry.id] as const] : [])));
  const collisionReasons = new Map<string, string[]>();
  for (const collision of ids.ids.collisions) {
    for (const entry of collision.resolved) {
      const namespace = entry.space ?? collision.namespace;
      const text = collisionReason(collision, entry);
      const targets = namespace === 'reaction' ? [ids.ids.reactionId(entry.original)] : namespace === 'label' ? [ids.ids.reagentFromLabelId(entry.original), ids.ids.speciesFromLabelId(entry.original)] : namespace === 'compound' ? [ids.ids.speciesId(entry.original)] : [];
      for (const target of targets) collisionReasons.set(target, [...(collisionReasons.get(target) ?? []), text]);
    }
  }

  const reactions: Reaction[] = [];
  const reasonsOf: string[][] = [];
  const refByLegacyReactionId = new Map<string, RecordRef>();
  const deferred: string[] = [];

  for (const [index, reaction] of data.reactions.entries()) {
    const key = ids.reactionKeys[index] as string;
    const legacyText = idKey(reaction.id);
    const recordId = ids.ids.reactionId(key);
    const ref: RecordRef = { kind: 'reaction', id: recordId } as RecordRef;
    if (!refByLegacyReactionId.has(legacyText)) refByLegacyReactionId.set(legacyText, ref);
    const scope = createScope(['reactions', index], trace, report, 'reaction.');

    const idStored = typeof reaction.id === 'string' && LabelTextSchema.safeParse(reaction.id).success;
    if (idStored) scope.consume(['id'], reaction.id);
    else {
      scope.keep(['id'], reaction.id);
      scope.reason(`id ${excerpt(reaction.id)} cannot be stored as a legacy id; kept in legacy.unmapped`);
    }
    const placeholder = missingId.get(index);
    if (placeholder !== undefined) scope.reason(`record had no id in the legacy file; the placeholder ${excerpt(placeholder)} was assigned`);
    if (key !== legacyText) scope.reason(`another reaction has the legacy id ${excerpt(legacyText)}; v6 resolves references to the first, this record got its own ID`);
    const legacyId = idStored ? legacyText : undefined;

    let name = `Unnamed legacy reaction #${index + 1}`;
    if (typeof reaction.name === 'string' && NameTextSchema.safeParse(reaction.name).success) {
      name = reaction.name;
      scope.consume(['name'], reaction.name);
    } else if (reaction.name === '' || reaction.name === null || reaction.name === undefined) {
      if (reaction.name !== undefined) scope.consume(['name'], reaction.name);
      scope.reason('the reaction has no name; a placeholder name was used');
    } else {
      scope.keep(['name'], reaction.name);
      scope.reason(`name cannot be stored (${typeof reaction.name === 'string' ? 'too long or has control characters' : `it is ${typeof reaction.name}`}); kept in legacy.unmapped, a placeholder name was used`);
    }
    const tags = tagsOf(scope, reaction.tags);

    const conditions = mapConditions(reaction.conditions, scope, report);
    const workup = emptyParameters();
    const participants = Array.isArray(reaction.participants) ? (reaction.participants as unknown[]) : [];
    if (reaction.participants !== undefined && !Array.isArray(reaction.participants)) {
      scope.keep(['participants'], reaction.participants);
      scope.reason(`participants is not a list (${excerpt(reaction.participants)}); kept in legacy.unmapped`);
    }
    const parts = await mapParticipants(
      { reaction, index, key, legacyId: legacyText, ref, ids: ids.ids, substances, assets, scope, stage1: conditions.parameters, workup },
      participants,
    );

    if (reaction.image !== undefined) {
      const image = reaction.image;
      if (image === '' || image === null) scope.consume(['image'], image);
      else if (typeof image !== 'string') {
        scope.keep(['image'], image);
        scope.reason(`image is ${typeof image}, not a data: URL; kept in legacy.unmapped`);
      } else {
        const result = await assets.attach(image, ref, undefined, legacyId);
        if (result.ok) scope.consume(['image'], image);
        else {
          scope.keep(['image'], image);
          scope.reason(`${result.reason}; kept in legacy.unmapped`);
        }
      }
    }

    const unknown = Object.keys(reaction).filter((k) => !MAPPED_KEYS.has(k) && !DEFERRED_REACTION_FIELDS.includes(k));
    for (const k of unknown) keepOnly(scope, [k], reaction[k], undefined);
    if (unknown.length > 0) scope.reason(`unknown legacy field(s) kept in legacy.unmapped: ${list(unknown.map((k) => excerpt(k, 30)))}`);
    for (const k of DEFERRED_REACTION_FIELDS) {
      if (Object.hasOwn(reaction, k)) for (const leaf of leavesOf(reaction[k], ['reactions', index, k])) deferred.push(formatPath(leaf.path));
    }

    // ---- scope and lifecycle
    const classes = parts.substanceRefs.filter((r) => r.kind === 'class');
    const speciesRefs = parts.substanceRefs.filter((r) => r.kind === 'species');
    const generic = classes.length > 0;
    if (generic && speciesRefs.length > 0) {
      scope.reason(`mixed scope: ${speciesRefs.length} species and ${classes.length} class reference(s) in one reaction; imported as generic (RXN-022)`);
    }
    const stages: Reaction['stages'] = [
      { id: ids.ids.stageId(key, 1) as Reaction['stages'][number]['id'], kind: 'reaction', participantIds: parts.stage1Ids as never, parameters: conditions.parameters, ...(conditions.originalText === undefined ? {} : { originalText: conditions.originalText }) },
    ];
    if (parts.hasWorkup) stages.push({ id: ids.ids.stageId(key, 2) as Reaction['stages'][number]['id'], kind: 'workup', participantIds: parts.workupIds as never, parameters: workup });
    const outcomes: Reaction['outcomes'] = parts.products.length === 0 ? [] : [
      { id: ids.ids.outcomeId(key) as Reaction['outcomes'][number]['id'], conditionVariantIds: [], selectivity: 'unspecified', products: parts.products, conceptIds: [] },
    ];
    const complete = parts.participants.some((p) => p.role === 'reactant') && outcomes.length > 0;
    if (!complete) scope.reason('the reaction has no reactant or no product, so it stays a draft (RXN-001, RXN-002)');
    const reasons = [...scope.reasons, ...(collisionReasons.get(recordId) ?? [])];
    reasonsOf.push(reasons);
    reactions.push({
      id: recordId as Reaction['id'],
      kind: 'reaction',
      name,
      aliases: [],
      scope: generic ? 'generic' : 'specific',
      purposes: [],
      namedReactionIds: [],
      transformationIds: [],
      reactionTypes: [],
      mechanismClasses: [],
      participants: parts.participants,
      stages,
      conditionVariants: [],
      outcomes,
      intermediates: parts.intermediates,
      mechanismIds: [],
      reversibility: { kind: 'unknown' },
      conceptIds: [],
      prerequisiteConceptIds: [],
      tags,
      citations: [],
      provenance: provenanceOf(stamp, legacyId, scope.unmapped()),
      review: reviewOf(reasons, complete ? 'published' : 'draft'),
    });
    report.created('reaction');
    for (const reason of reasons) report.review(ref, reason);
  }

  const made = substances.records((id) => collisionReasons.get(id) ?? []);
  for (const record of [...made.species, ...made.reagent]) {
    report.created(record.kind);
    for (const reason of record.review.reasons) report.review({ kind: record.kind, id: record.id } as RecordRef, reason);
  }
  assets.created().forEach(() => report.created('asset'));

  const duplicated = duplicatedIds([
    ...reactions.map((r) => r.id as string),
    ...made.species.map((r) => r.id as string),
    ...made.reagent.map((r) => r.id as string),
    ...assets.created().map((r) => r.id as string),
    ...compounds.records.species.map((r) => r.id as string),
    ...compounds.records.class.map((r) => r.id as string),
    ...compounds.records.asset.map((r) => r.id as string),
  ]);
  if (duplicated.length > 0) {
    return { ok: false, code: 'DUPLICATE_RECORD_ID', message: `two records of the mapped reactions and compounds got the same ID: ${list(duplicated)}; nothing was mapped`, ids: duplicated };
  }

  const built = report.build();
  options.report?.absorb(built);
  return {
    ok: true,
    records: { reaction: reactions, reagent: made.reagent, species: made.species, asset: assets.created() },
    updatedAssets: assets.updated(),
    assetBytes: assets.bytes(),
    deferred,
    consumed: trace.paths,
    refByLegacyReactionId,
    report: built,
    unhandledDropped: compounds.unhandledDropped,
  };
}
