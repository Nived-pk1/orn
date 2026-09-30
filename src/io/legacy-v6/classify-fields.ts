/**
 * The classification fields of ONE legacy reaction (step 3.11b, docs/MIGRATION.md §4.5): transformation, mechanism, reactionType,
 * reactionFamily, reagentFamily, namedReaction, chapter, collapseIntermediates and `_v4`. Rules that hold for every field: an empty
 * value is consumed and stores nothing; a value the target accepts is stored verbatim (no trimming, no repair); a value it does not
 * accept, or that has no field to go to, is kept whole in `provenance.legacy.unmapped`, with a review reason where a person has to
 * decide. Nothing is guessed. `jee` and `relatedReactions` are in `classify-jee.ts`.
 */
import { NameTextSchema, RichTextSchema, ShortTextSchema, LIMITS, type Classification, type Mechanism, type RecordRef, type TopicMapping } from '@/core/schema';
import { keepOnly, take } from './compound-convert';
import { provenanceOf, reviewOf, type Stamp } from './compound-records';
import { excerpt } from './compound-scope';
import type { ClassificationBook } from './classify-book';
import type { ClassScope } from './classify-scope';
import type { TransformationBook } from './classify-transformations';
import type { MappedCompounds } from './compound-map';
import { texts } from './id-collect';
import type { LegacyIdSpace } from './id-space';
import type { ReportBuilder } from './report';
import { isObj, type LegacyObject } from './text';

/** What the classification fields put on the reaction record. */
export interface ReactionFields {
  namedReactionIds: string[];
  transformationIds: string[];
  reactionTypes: Classification[];
  mechanismClasses: Classification[];
  mechanismIds: string[];
  conceptIds: string[];
  prerequisiteConceptIds: string[];
  difficulty?: number;
  generalizedEquation?: string;
}

export const emptyFields = (): ReactionFields => ({ namedReactionIds: [], transformationIds: [], reactionTypes: [], mechanismClasses: [], mechanismIds: [], conceptIds: [], prerequisiteConceptIds: [] });

/** The shared, mutable state of the whole step that a reaction's fields write to. */
export interface ClassifyEnv {
  readonly ids: LegacyIdSpace;
  readonly stamp: Stamp;
  readonly report: ReportBuilder;
  readonly book: ClassificationBook;
  readonly transformations: TransformationBook;
  readonly compounds: MappedCompounds;
  /** Functional-group id → the class standing for it: the classes step 3.10 made for the groups of species, then the hub classes that carry an `fgId` (first hub wins, as in 3.10). */
  readonly groupClass: ReadonlyMap<string, string>;
  readonly mechanisms: Mechanism[];
  readonly topicMappings: TopicMapping[];
  /** Distinct `reagentFamily` values with the number of reactions that carry them. */
  readonly reagentFamilies: Map<string, number>;
}

export interface ReactionTarget {
  readonly index: number;
  readonly key: string;
  readonly ref: RecordRef;
  readonly name: string;
}

/** Half of `ShortText` less the arrow: both halves of an equation always fit the field. */
const EQUATION_PART_MAX = Math.floor((LIMITS.shortText - 3) / 2);
const EquationPart = { safeParse: (value: unknown) => ({ success: typeof value === 'string' && value.trim() !== '' && value.length <= EQUATION_PART_MAX && ShortTextSchema.safeParse(value).success }) };
const NotBlankShort = { safeParse: (value: unknown) => ({ success: typeof value === 'string' && value.trim() !== '' && ShortTextSchema.safeParse(value).success }) };
const NotBlankRichText = { safeParse: (value: unknown) => ({ success: typeof value === 'string' && value.trim() !== '' && RichTextSchema.safeParse(value).success }) };

/** Keeps the fields of `value` that are not in `known` (a v6 record keeps unknown fields on `transformation`, `mechanism` and `jee`). */
export function keepUnknown(cs: ClassScope, path: readonly string[], value: LegacyObject, known: ReadonlySet<string>): void {
  const unknown = Object.keys(value).filter((key) => !known.has(key));
  for (const key of unknown) keepOnly(cs, [...path, key], value[key], undefined);
  if (unknown.length > 0) cs.reason(`unknown legacy field(s) under ${path.join('.')} kept in legacy.unmapped: ${unknown.map((key) => excerpt(key, 30)).join(', ')}`);
}

const TRANSFORMATION_KEYS: ReadonlySet<string> = new Set(['from', 'to', 'fgFrom', 'fgTo', 'bondChanges']);

/** A list of functional-group ids: the class each stands for (through step 3.10), what has none, and every text as the ID needs it. */
function groupsOf(cs: ClassScope, env: ClassifyEnv, path: 'fgFrom' | 'fgTo', value: unknown, index: number): { texts: string[]; classIds: string[] } {
  const at = ['transformation', path] as const;
  if (value === undefined) return { texts: [], classIds: [] };
  if (!Array.isArray(value)) {
    keepOnly(cs, at, value, `transformation.${path} is not a list (${excerpt(value)}); kept in legacy.unmapped`);
    return { texts: [], classIds: [] };
  }
  const classIds: string[] = [];
  const unresolved: unknown[] = [];
  const unresolvedPaths: string[] = [];
  value.forEach((entry, k) => {
    if (entry === '' || entry === null) return cs.consume([...at, k], entry);
    const classId = typeof entry === 'string' && entry.trim() !== '' ? env.groupClass.get(entry) : undefined;
    if (classId === undefined) {
      unresolved.push(entry);
      unresolvedPaths.push(`reactions[${index}].transformation.${path}[${k}]`);
      return;
    }
    if (classIds.includes(classId)) env.report.note('FG_REPEATED_IN_SET');
    else classIds.push(classId);
    cs.consume([...at, k], entry);
  });
  if (unresolved.length > 0) {
    cs.keepListed(at, unresolved, unresolvedPaths);
    cs.reason(`functional group(s) ${unresolved.map((entry) => excerpt(entry, 30)).join(', ')} in transformation.${path} have no class in this import (no hub or compound carries them); kept in legacy.unmapped`);
  }
  return { texts: texts(value), classIds };
}

function transformationOf(env: ClassifyEnv, cs: ClassScope, value: unknown, target: ReactionTarget, fields: ReactionFields): void {
  if (value === undefined) return;
  if (!isObj(value) || Array.isArray(value)) {
    keepOnly(cs, ['transformation'], value, `transformation is not an object (${excerpt(value)}); kept in legacy.unmapped`);
    return;
  }
  const from = take(cs, ['transformation', 'from'], value.from, EquationPart, `transformation.from cannot be stored as equation text (${excerpt(value.from)}); kept in legacy.unmapped`);
  const to = take(cs, ['transformation', 'to'], value.to, EquationPart, `transformation.to cannot be stored as equation text (${excerpt(value.to)}); kept in legacy.unmapped`);
  if (from !== undefined || to !== undefined) fields.generalizedEquation = from !== undefined && to !== undefined ? `${from} → ${to}` : (from ?? `→ ${to as string}`);

  const groupsFrom = groupsOf(cs, env, 'fgFrom', value.fgFrom, target.index);
  const groupsTo = groupsOf(cs, env, 'fgTo', value.fgTo, target.index);
  const rawBond = value.bondChanges;
  const bond = typeof rawBond === 'string' && NotBlankShort.safeParse(rawBond).success ? rawBond : undefined;
  const emptyBond = rawBond === undefined || rawBond === '' || rawBond === null;
  if (emptyBond) {
    if (rawBond !== undefined) cs.consume(['transformation', 'bondChanges'], rawBond);
  } else if (bond === undefined) {
    cs.keep(['transformation', 'bondChanges'], rawBond);
    cs.reason(`transformation.bondChanges cannot be stored (${excerpt(rawBond)}); kept in legacy.unmapped`);
  }
  if (groupsFrom.classIds.length + groupsTo.classIds.length > 0) {
    const result = env.transformations.resolve({ fgFrom: groupsFrom.texts, fgTo: groupsTo.texts, fromClassIds: groupsFrom.classIds, toClassIds: groupsTo.classIds, bondChanges: bond });
    fields.transformationIds.push(result.id);
    if (bond !== undefined && result.bondStored) cs.consume(['transformation', 'bondChanges'], rawBond);
    else if (bond !== undefined) {
      cs.keep(['transformation', 'bondChanges'], rawBond);
      cs.reason(`the transformation ${result.id} already has another bond-change text; this reaction's ${excerpt(bond)} is kept in legacy.unmapped`);
    }
  } else if (bond !== undefined) {
    cs.keep(['transformation', 'bondChanges'], rawBond);
    cs.reason(`transformation.bondChanges ${excerpt(bond)} has no transformation record to belong to (no functional-group class known); kept in legacy.unmapped`);
  }
  keepUnknown(cs, ['transformation'], value, TRANSFORMATION_KEYS);
}

const MECHANISM_KEYS: ReadonlySet<string> = new Set(['type', 'summary']);

function mechanismOf(env: ClassifyEnv, cs: ClassScope, value: unknown, target: ReactionTarget, fields: ReactionFields): void {
  if (value === undefined) return;
  if (!isObj(value) || Array.isArray(value)) {
    keepOnly(cs, ['mechanism'], value, `mechanism is not an object (${excerpt(value)}); kept in legacy.unmapped`);
    return;
  }
  const type = take(cs, ['mechanism', 'type'], value.type, NameTextSchema, `mechanism.type cannot be used as a concept name (${excerpt(value.type)}); kept in legacy.unmapped`);
  if (type !== undefined) {
    const resolved = env.book.concept(type, 'mechanism_class', 'mechanism.type');
    fields.mechanismClasses.push({ conceptId: resolved.id as Classification['conceptId'], certainty: 'probable' });
    if (resolved.note !== undefined) cs.reason(resolved.note);
  }
  const summary = take(cs, ['mechanism', 'summary'], value.summary, NotBlankRichText, `mechanism.summary cannot be stored as text (${excerpt(value.summary)}); kept in legacy.unmapped`);
  if (summary !== undefined) {
    const id = env.ids.mechanismId(target.key);
    const named = `Mechanism of ${target.name}`;
    env.mechanisms.push({
      id: id as Mechanism['id'],
      kind: 'mechanism',
      name: NameTextSchema.safeParse(named).success ? named : `Mechanism of reaction #${target.index + 1}`,
      aliases: [],
      mechanismClasses: [...fields.mechanismClasses],
      summary,
      variants: [],
      conceptIds: [],
      tags: [],
      citations: [],
      provenance: provenanceOf(env.stamp, undefined),
      review: reviewOf([]),
    });
    fields.mechanismIds.push(id);
  }
  keepUnknown(cs, ['mechanism'], value, MECHANISM_KEYS);
}

/** `Uncategorised` is v6's word for "no chapter" (quirk r22): no topic, no mapping, nothing kept. */
const NO_CHAPTER = 'Uncategorised';

function chapterOf(env: ClassifyEnv, cs: ClassScope, value: unknown, target: ReactionTarget): void {
  if (value === NO_CHAPTER) return cs.consume(['chapter'], value);
  const text = take(cs, ['chapter'], value, NameTextSchema, `chapter cannot be used as a topic name (${excerpt(value)}); kept in legacy.unmapped`);
  if (text === undefined) return;
  const resolved = env.book.topic(text);
  if (resolved.note !== undefined) cs.reason(resolved.note);
  env.topicMappings.push({
    id: env.ids.topicMappingId(target.key) as TopicMapping['id'],
    kind: 'topic_mapping',
    topicId: resolved.id as TopicMapping['topicId'],
    target: target.ref,
    role: 'core',
    tags: [],
    citations: [],
    provenance: provenanceOf(env.stamp, undefined),
    review: reviewOf([]),
  });
}

/** Everything of the classification block except `jee` and `relatedReactions`. */
export function classifyFields(env: ClassifyEnv, cs: ClassScope, reaction: LegacyObject, target: ReactionTarget, fields: ReactionFields): void {
  transformationOf(env, cs, reaction.transformation, target, fields);
  mechanismOf(env, cs, reaction.mechanism, target, fields);

  const type = take(cs, ['reactionType'], reaction.reactionType, NameTextSchema, `reactionType cannot be used as a concept name (${excerpt(reaction.reactionType)}); kept in legacy.unmapped`);
  if (type !== undefined) {
    const resolved = env.book.concept(type, 'reaction_type', 'reactionType');
    fields.reactionTypes.push({ conceptId: resolved.id as Classification['conceptId'], certainty: 'definite' });
    if (resolved.note !== undefined) cs.reason(resolved.note);
  }
  const family = take(cs, ['reactionFamily'], reaction.reactionFamily, NameTextSchema, `reactionFamily cannot be used as a concept name (${excerpt(reaction.reactionFamily)}); kept in legacy.unmapped`);
  if (family !== undefined) {
    const resolved = env.book.concept(family, 'reaction_family', 'reactionFamily');
    fields.conceptIds.push(resolved.id);
    if (resolved.note !== undefined) cs.reason(resolved.note);
  }

  // reagentFamily: free text such as "aq. KOH" or "Cumene process". No ORN field takes it; the preview lists the distinct values (step 3.11c).
  const family2 = reaction.reagentFamily;
  if (family2 === undefined || family2 === '' || family2 === null) {
    if (family2 !== undefined) cs.consume(['reagentFamily'], family2);
  } else {
    cs.keep(['reagentFamily'], family2);
    const text = typeof family2 === 'string' ? family2 : (JSON.stringify(family2) ?? String(family2));
    env.reagentFamilies.set(text, (env.reagentFamilies.get(text) ?? 0) + 1);
  }

  const named = take(cs, ['namedReaction'], reaction.namedReaction, NameTextSchema, `namedReaction cannot be used as a name (${excerpt(reaction.namedReaction)}); kept in legacy.unmapped`);
  if (named !== undefined) {
    const resolved = env.book.namedReaction(named);
    fields.namedReactionIds.push(resolved.id);
    if (resolved.note !== undefined) cs.reason(resolved.note);
  }

  chapterOf(env, cs, reaction.chapter, target);
  // v6 display settings and the v4 audit trail have no ORN field; they are kept whole (§4.5), nobody has to decide anything
  if (reaction.collapseIntermediates !== undefined) cs.keep(['collapseIntermediates'], reaction.collapseIntermediates);
  if (reaction._v4 !== undefined) cs.keep(['_v4'], reaction._v4);
}
