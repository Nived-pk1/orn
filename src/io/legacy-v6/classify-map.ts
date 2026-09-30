/**
 * v5 reactions → ORN records, part 2 (step 3.11b, docs/MIGRATION.md §4.5 and §4.8): classification and curriculum. Input is the 3.8
 * port's output (`data`), the document's ID space, the 3.10 compound result, the 3.11a reaction result (its `deferred` paths are
 * exactly what this step consumes; its `unhandledDropped` are the dropped leaves of reactions and of the top level) and an optional
 * `LegacyMatchContext` (the live dataset's concepts, named reactions, topics and exams; empty by default).
 *
 * Each reaction is returned as a changed copy with its transformation, mechanism, reaction types, concepts, named reaction,
 * difficulty and review reasons filled in; new records: concepts, named reactions, topics (created only when neither the context nor
 * this import has one), topic mappings, transformations, mechanisms, caveats (traps), relationships (`related_to`) and exam relevance
 * (exams are never created). After this step nothing is deferred and no dropped leaf is unhandled: `deferred` and
 * `unhandledDropped` in the result are the leftovers, and stay empty. Deterministic (injected clock, no randomness), bounded (Map
 * lookups; work linear in the document plus the context), total (never throws for parsed JSON).
 */
import { IsoDateTimeSchema, type AnyRecord, type Caveat, type ExamRelevance, type JsonValue, type Mechanism, type Reaction, type RecordRef, type Relationship, type TopicMapping } from '@/core/schema';
import type { LegacyImportReport } from '../contracts';
import { createClassificationBook, type CreatedClassification } from './classify-book';
import { classifyFields, emptyFields, type ClassifyEnv, type ReactionFields, type ReactionTarget } from './classify-fields';
import { jeeOf, relatedOf, type JeeEnv } from './classify-jee';
import { createClassScope, type ClassScope } from './classify-scope';
import { createTransformationBook } from './classify-transformations';
import { duplicatedIds, list } from './compound-review';
import type { MappedCompounds } from './compound-map';
import { reviewOf, type Stamp } from './compound-records';
import { excerpt, jsonSafe } from './compound-scope';
import type { DroppedLeaf } from './dropped';
import type { LegacyDocumentIds } from './id-collect';
import type { LegacyV5Data } from './legacy-types';
import { createMatchIndex, EMPTY_MATCH_CONTEXT, type LegacyMatchContext } from './match-context';
import { LEGACY_V5_SCHEMA_VERSION } from './normalize';
import type { MappedReactions } from './reaction-map';
import { createReportBuilder, LEGACY_SYSTEM, type ReportBuilder } from './report';
import { createTrace, generalizePath, isEmptyLegacyValue } from './trace';

export interface MapClassificationInput {
  readonly data: LegacyV5Data;
  readonly ids: LegacyDocumentIds;
  readonly compounds: MappedCompounds;
  /** The 3.11a result: its reaction records are what this step completes; `deferred` and `unhandledDropped` are what it consumes. */
  readonly reactions: MappedReactions;
}

export interface MapClassificationOptions {
  /** Injected clock: a UTC ISO timestamp with `Z`, read once per run. */
  readonly now: () => string;
  /** The live dataset's concepts, named reactions, topics and exams (read-only plain data). Default: empty. */
  readonly context?: LegacyMatchContext;
  /** Share one report with the earlier steps; a fresh one is made when absent. Absorbed only when the run succeeds. */
  readonly report?: ReportBuilder;
}

export interface MappedClassificationRecords {
  /** The 3.11a reactions, completed (same order, same IDs). */
  readonly reaction: Reaction[];
  readonly concept: CreatedClassification['concept'];
  readonly named_reaction: CreatedClassification['named_reaction'];
  readonly topic: CreatedClassification['topic'];
  readonly topic_mapping: TopicMapping[];
  readonly transformation: ReturnType<ReturnType<typeof createTransformationBook>['records']>;
  readonly mechanism: Mechanism[];
  readonly caveat: Caveat[];
  readonly relationship: Relationship[];
  readonly exam_relevance: ExamRelevance[];
}

export interface MappedClassification {
  readonly ok: true;
  readonly records: MappedClassificationRecords;
  /** Legacy leaf paths this step turned into schema fields. */
  readonly consumed: ReadonlySet<string>;
  /** The distinct `reagentFamily` values with the number of reactions that carry them (kept in `legacy.unmapped`; step 3.11c makes preview decisions of them), by value. */
  readonly reagentFamilies: readonly { readonly value: string; readonly count: number }[];
  /** Values that belong to the document and no record (also `report.documentUnmapped`). */
  readonly documentUnmapped: Readonly<Record<string, JsonValue>>;
  /** Paths of the 3.11a `deferred` list this step neither consumed nor kept. Empty: nothing is deferred any more. */
  readonly deferred: readonly string[];
  /** Dropped leaves this step did not place. Empty. */
  readonly unhandledDropped: readonly DroppedLeaf[];
  readonly report: LegacyImportReport;
}

export type MapClassificationResult =
  | MappedClassification
  | { readonly ok: false; readonly code: 'INVALID_CLOCK' | 'DUPLICATE_RECORD_ID'; readonly message: string; readonly ids?: readonly string[] };

const DROPPED_REACTION = /^reactions\[(\d+)\](.*)$/s;
const DEFERRED_REACTION = /^reactions\[(\d+)\]/;
const TOP_LEVEL_RECORDS: ReadonlySet<string> = new Set(['compounds', 'reactions', 'schemaVersion']);

/** The reaction with its classification fields and the new review reasons; the record keeps its lifecycle. */
function completed(record: Reaction, fields: ReactionFields, cs: ClassScope): Reaction {
  const old = record.provenance.legacy ?? { system: LEGACY_SYSTEM };
  const added = cs.unmapped();
  let unmapped = old.unmapped;
  if (added !== undefined) {
    const before = (typeof old.unmapped === 'object' && old.unmapped !== null && !Array.isArray(old.unmapped) ? old.unmapped : {}) as { [key: string]: JsonValue };
    const merged: { [key: string]: JsonValue } = { ...before };
    // a legacy field this step also writes (an unknown field named `dropped`) keeps its own entry; the new one gets a suffix, nothing is overwritten
    for (const [key, value] of Object.entries(added)) merged[Object.hasOwn(before, key) ? `${key}#3.11b` : key] = value;
    unmapped = merged;
  }
  const lifecycle = record.review.lifecycle === 'draft' ? 'draft' : 'published';
  return {
    ...record,
    namedReactionIds: fields.namedReactionIds as Reaction['namedReactionIds'],
    transformationIds: fields.transformationIds as Reaction['transformationIds'],
    reactionTypes: fields.reactionTypes,
    mechanismClasses: fields.mechanismClasses,
    mechanismIds: fields.mechanismIds as Reaction['mechanismIds'],
    conceptIds: fields.conceptIds as Reaction['conceptIds'],
    prerequisiteConceptIds: fields.prerequisiteConceptIds as Reaction['prerequisiteConceptIds'],
    ...(fields.generalizedEquation === undefined ? {} : { generalizedEquation: fields.generalizedEquation }),
    ...(fields.difficulty === undefined ? {} : { difficulty: fields.difficulty }),
    provenance: { ...record.provenance, legacy: { ...old, ...(unmapped === undefined ? {} : { unmapped }) } },
    review: reviewOf([...record.review.reasons, ...cs.reasons], lifecycle),
  };
}

export function mapLegacyClassification(input: MapClassificationInput, options: MapClassificationOptions): MapClassificationResult {
  const at = options.now();
  if (!IsoDateTimeSchema.safeParse(at).success) return { ok: false, code: 'INVALID_CLOCK', message: `the injected clock returned ${excerpt(at)}, not a UTC ISO-8601 timestamp` };
  const stamp: Stamp = { at };
  const { data, ids, compounds } = input;
  const report = createReportBuilder(LEGACY_V5_SCHEMA_VERSION); // absorbed into `options.report` only when the run succeeds
  const index = createMatchIndex(options.context ?? EMPTY_MATCH_CONTEXT);
  const classNames = new Map(compounds.records.class.map((record) => [record.id as string, record.names.canonical] as const));
  const groupClass = new Map(compounds.functionalGroupClass);
  const hubOf = new Map(compounds.hubs.map((hub) => [hub.key, hub] as const));
  ids.compoundKeys.forEach((key, position) => {
    const hub = hubOf.get(key);
    const fg = data.compounds[position]?.fgId;
    if (hub !== undefined && hub.decision === 'class' && typeof fg === 'string' && fg !== '' && !groupClass.has(fg)) groupClass.set(fg, hub.ref.id);
  });
  const jee: JeeEnv = { index, examRelevance: [], caveats: [], relationships: [], relatedMade: new Set(), refByLegacyReactionId: input.reactions.refByLegacyReactionId };
  const env: ClassifyEnv & JeeEnv = {
    ...jee,
    ids: ids.ids,
    stamp,
    report,
    book: createClassificationBook({ ids: ids.ids, index, stamp }),
    transformations: createTransformationBook({ ids: ids.ids, stamp, classNames }),
    compounds,
    groupClass,
    mechanisms: [],
    topicMappings: [],
    reagentFamilies: new Map(),
  };

  // dropped leaves of the v4 → v5 port that are not under a compound (§4.8): the ones under a reaction go to that reaction
  const droppedOf = new Map<number, { sub: string; leaf: DroppedLeaf }[]>();
  const documentDropped: DroppedLeaf[] = [];
  for (const leaf of input.reactions.unhandledDropped) {
    const match = DROPPED_REACTION.exec(leaf.path);
    const at2 = match === null ? -1 : Number(match[1]);
    const sub = (match?.[2] ?? '').replace(/^\./, '');
    if (match === null || at2 >= data.reactions.length || sub === '') documentDropped.push(leaf);
    else droppedOf.set(at2, [...(droppedOf.get(at2) ?? []), { sub, leaf }]);
  }

  const reactions: Reaction[] = [];
  const scopes: ClassScope[] = [];
  input.reactions.records.reaction.forEach((record, position) => {
    const legacy = data.reactions[position] ?? {};
    const target: ReactionTarget = { index: position, key: ids.reactionKeys[position] as string, ref: { kind: 'reaction', id: record.id } as RecordRef, name: record.name };
    const cs = createClassScope(['reactions', position], report);
    const fields = emptyFields();
    classifyFields(env, cs, legacy, target, fields);
    jeeOf(env, cs, legacy.jee, target, fields);
    relatedOf(env, cs, legacy.relatedReactions, target);
    const dropped = droppedOf.get(position) ?? [];
    for (const { sub, leaf } of dropped) {
      if (isEmptyLegacyValue(leaf.value)) report.consumedByDefault(generalizePath(leaf.path));
      else cs.keepDropped(sub, leaf.path, leaf.value);
    }
    const kept = dropped.filter(({ leaf }) => !isEmptyLegacyValue(leaf.value)).length;
    if (kept > 0) cs.reason(`${kept} legacy value(s) were changed or dropped by v6's own normalisation; the originals are kept in legacy.unmapped.dropped`);
    scopes.push(cs);
    reactions.push(completed(record, fields, cs));
    for (const reason of cs.reasons) report.review(target.ref, reason);
  });

  // the document: fields next to `compounds` and `reactions`, and dropped leaves that name no record
  const documentTrace = createTrace();
  const holdDocument = (key: string, value: unknown, countAs: string): void => {
    report.documentValue(key, jsonSafe(value));
    report.preserved(`document.${countAs}`);
    report.note('DOCUMENT_VALUE_KEPT');
  };
  for (const key of Object.keys(data)) {
    if (key === 'schemaVersion') documentTrace.consume(['schemaVersion'], data.schemaVersion);
    else if (!TOP_LEVEL_RECORDS.has(key)) holdDocument(key, data[key], generalizePath(key));
  }
  for (const leaf of documentDropped) {
    if (isEmptyLegacyValue(leaf.value)) report.consumedByDefault(generalizePath(leaf.path));
    else holdDocument(`dropped.${leaf.path}`, leaf.value, `dropped.${generalizePath(leaf.path)}`);
  }

  const made = env.book.records();
  const records: MappedClassificationRecords = {
    reaction: reactions,
    concept: made.concept,
    named_reaction: made.named_reaction,
    topic: made.topic,
    topic_mapping: env.topicMappings,
    transformation: env.transformations.records(),
    mechanism: env.mechanisms,
    caveat: env.caveats,
    relationship: env.relationships,
    exam_relevance: env.examRelevance,
  };
  const created: AnyRecord[] = [
    ...records.concept, ...records.named_reaction, ...records.topic, ...records.topic_mapping, ...records.transformation, ...records.mechanism, ...records.caveat, ...records.relationship,
    ...records.exam_relevance,
  ];
  for (const record of created) {
    report.created(record.kind);
    const reasons = 'review' in record ? record.review.reasons : [];
    for (const reason of reasons) report.review({ kind: record.kind, id: record.id } as RecordRef, reason);
  }

  const duplicated = duplicatedIds([
    ...created.map((record) => record.id as string),
    ...reactions.map((record) => record.id as string),
    ...input.reactions.records.reagent.map((record) => record.id as string),
    ...input.reactions.records.species.map((record) => record.id as string),
    ...compounds.records.species.map((record) => record.id as string),
    ...compounds.records.class.map((record) => record.id as string),
  ]);
  if (duplicated.length > 0) {
    return { ok: false, code: 'DUPLICATE_RECORD_ID', message: `two records of the mapped classification got the same ID: ${list(duplicated)}; nothing was mapped`, ids: duplicated };
  }

  const unresolved = input.reactions.deferred.filter((path) => {
    const at3 = DEFERRED_REACTION.exec(path);
    const scope = at3 === null ? undefined : scopes[Number(at3[1])];
    return scope === undefined || !scope.isAccounted(path);
  });
  const consumed = new Set<string>(documentTrace.paths);
  for (const scope of scopes) for (const path of scope.consumedPaths) consumed.add(path);

  const built = report.build();
  options.report?.absorb(built);
  return {
    ok: true,
    records,
    consumed,
    reagentFamilies: [...env.reagentFamilies].map(([value, count]) => ({ value, count })).sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : 0)),
    documentUnmapped: built.documentUnmapped,
    deferred: unresolved,
    unhandledDropped: [],
    report: built,
  };
}
