/**
 * `jee` and `relatedReactions` of ONE legacy reaction (step 3.11b, docs/MIGRATION.md §4.5): relevance → `exam_relevance` records for
 * the exams of the LIVE dataset (never created), difficulty → `difficulty`, traps → one `caveat` each, prerequisites and concepts →
 * concepts matched or created, related reactions → `related_to` relationships (one per unordered pair of existing reactions).
 */
import { LabelTextSchema, LIMITS, NameTextSchema, RichTextSchema, type Caveat, type ExamRelevance, type RecordRef, type Relationship } from '@/core/schema';
import { fold } from '@/core/text';
import { keepOnly } from './compound-convert';
import { provenanceOf, reviewOf } from './compound-records';
import { excerpt } from './compound-scope';
import { keepUnknown, type ClassifyEnv, type ReactionFields, type ReactionTarget } from './classify-fields';
import type { ClassScope } from './classify-scope';
import { examTargetsOf } from './exam-vocab';
import type { MatchIndex } from './match-context';
import { isObj } from './text';

/** State of the step that only the jee mapping writes to. */
export interface JeeEnv {
  readonly index: MatchIndex;
  readonly examRelevance: ExamRelevance[];
  readonly caveats: Caveat[];
  readonly relationships: Relationship[];
  /** `rel_…` IDs already made: one relationship per unordered pair, whichever reaction lists the other first. */
  readonly relatedMade: Set<string>;
  /** A legacy reaction ID → the reaction record it became (the first with that ID, as v6's lookups resolve it). */
  readonly refByLegacyReactionId: ReadonlyMap<string, RecordRef>;
}

const JEE_KEYS: ReadonlySet<string> = new Set(['relevance', 'difficulty', 'traps', 'prerequisites', 'concepts']);
const NOT_VERIFIED = 'imported flag, not verified against a syllabus';

function relevanceOf(env: ClassifyEnv & JeeEnv, cs: ClassScope, value: unknown, target: ReactionTarget): void {
  if (value === undefined || value === '' || value === null) {
    if (value !== undefined) cs.consume(['jee', 'relevance'], value);
    return;
  }
  const wanted = typeof value === 'string' ? examTargetsOf(value) : undefined;
  if (wanted === undefined) {
    cs.keep(['jee', 'relevance'], value);
    cs.reason(`jee.relevance ${excerpt(value)} is not one of both / main / advanced; kept in legacy.unmapped`);
    return;
  }
  const missing: string[] = [];
  for (const exam of wanted) {
    const found = env.index.find('exam', fold(exam.examName));
    const first = found[0];
    if (first === undefined) {
      missing.push(exam.examName);
      continue;
    }
    const reasons = [NOT_VERIFIED];
    if (found.length > 1) reasons.push(`${found.length} exams of the dataset are named ${excerpt(exam.examName)}; the first by ID (${first.id}) was used`);
    env.examRelevance.push({
      id: env.ids.relevanceId(target.key, exam.key) as ExamRelevance['id'],
      kind: 'exam_relevance',
      target: target.ref,
      examId: first.id as ExamRelevance['examId'],
      examVersionIds: [],
      scope: 'official',
      tags: [],
      citations: [],
      provenance: provenanceOf(env.stamp, undefined),
      review: reviewOf(reasons),
    });
  }
  if (missing.length === 0) return cs.consume(['jee', 'relevance'], value);
  cs.keep(['jee', 'relevance'], value);
  cs.reason(`no ${missing.map((name) => excerpt(name)).join(' or ')} exam in this dataset; jee.relevance ${excerpt(value)} kept in legacy.unmapped`);
}

function difficultyOf(cs: ClassScope, value: unknown, fields: ReactionFields): void {
  if (value === undefined) return;
  if (value === 0) return cs.consume(['jee', 'difficulty'], value); // v6's "not set": absent
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5) {
    fields.difficulty = value;
    return cs.consume(['jee', 'difficulty'], value);
  }
  cs.keep(['jee', 'difficulty'], value);
  cs.reason(`jee.difficulty ${excerpt(value)} is not a whole number from 1 to 5; kept in legacy.unmapped`);
}

/** A list of texts under `jee` (traps, prerequisites, concepts): `use` gets each text the target accepts; the others are kept. */
function textsOf(cs: ClassScope, field: string, value: unknown, index: number, accepts: (text: string) => boolean, use: (text: string, position: number) => boolean): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    keepOnly(cs, ['jee', field], value, `jee.${field} is not a list (${excerpt(value)}); kept in legacy.unmapped`);
    return;
  }
  const kept: unknown[] = [];
  const keptPaths: string[] = [];
  value.forEach((entry, k) => {
    if (entry === '' || entry === null) return cs.consume(['jee', field, k], entry);
    if (typeof entry === 'string' && accepts(entry) && use(entry, k + 1)) return cs.consume(['jee', field, k], entry);
    kept.push(entry);
    keptPaths.push(`reactions[${index}].jee.${field}[${k}]`);
  });
  if (kept.length > 0) {
    cs.keepListed(['jee', field], kept, keptPaths);
    cs.reason(`${kept.length} entr${kept.length === 1 ? 'y' : 'ies'} of jee.${field} cannot be stored (${kept.map((entry) => excerpt(entry, 30)).join(', ')}); kept in legacy.unmapped`);
  }
}

const isName = (text: string): boolean => NameTextSchema.safeParse(text).success;

function conceptsOf(env: ClassifyEnv, cs: ClassScope, field: 'prerequisites' | 'concepts', value: unknown, target: ReactionTarget, into: string[]): void {
  textsOf(cs, field, value, target.index, isName, (text) => {
    const resolved = env.book.concept(text, 'general', `jee.${field}`);
    if (resolved.note !== undefined) cs.reason(resolved.note);
    if (into.includes(resolved.id)) env.report.note('CONCEPT_REPEATED_IN_LIST');
    else if (into.length >= LIMITS.idList) return false;
    else into.push(resolved.id);
    return true;
  });
}

function trapsOf(env: ClassifyEnv & JeeEnv, cs: ClassScope, value: unknown, target: ReactionTarget): void {
  textsOf(cs, 'traps', value, target.index, (text) => RichTextSchema.safeParse(text).success && text.trim() !== '', (text, n) => {
    env.caveats.push({
      id: env.ids.caveatId(target.key, n) as Caveat['id'],
      kind: 'caveat',
      caveatKind: 'trap',
      title: LabelTextSchema.safeParse(text).success ? text : `Trap ${n} of reaction #${target.index + 1}`,
      statement: text,
      targets: [{ ref: target.ref, as: 'affected_reaction' }],
      conceptIds: [],
      tags: [],
      citations: [],
      provenance: provenanceOf(env.stamp, undefined),
      review: reviewOf([]),
    });
    return true;
  });
}

export function jeeOf(env: ClassifyEnv & JeeEnv, cs: ClassScope, value: unknown, target: ReactionTarget, fields: ReactionFields): void {
  if (value === undefined) return;
  if (!isObj(value) || Array.isArray(value)) {
    keepOnly(cs, ['jee'], value, `jee is not an object (${excerpt(value)}); kept in legacy.unmapped`);
    return;
  }
  relevanceOf(env, cs, value.relevance, target);
  difficultyOf(cs, value.difficulty, fields);
  trapsOf(env, cs, value.traps, target);
  conceptsOf(env, cs, 'prerequisites', value.prerequisites, target, fields.prerequisiteConceptIds);
  conceptsOf(env, cs, 'concepts', value.concepts, target, fields.conceptIds);
  keepUnknown(cs, ['jee'], value, JEE_KEYS);
}

/** `relatedReactions` → `related_to` relationships. A related ID that names no reaction is kept and reviewed; a placeholder reaction is never made. */
export function relatedOf(env: ClassifyEnv & JeeEnv, cs: ClassScope, value: unknown, target: ReactionTarget): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    keepOnly(cs, ['relatedReactions'], value, `relatedReactions is not a list (${excerpt(value)}); kept in legacy.unmapped`);
    return;
  }
  const unknown: unknown[] = [];
  const unknownPaths: string[] = [];
  const self: unknown[] = [];
  const selfPaths: string[] = [];
  value.forEach((entry, k) => {
    const path = `reactions[${target.index}].relatedReactions[${k}]`;
    if (entry === '' || entry === null) return cs.consume(['relatedReactions', k], entry);
    const other = typeof entry === 'string' ? env.refByLegacyReactionId.get(entry) : undefined;
    if (typeof entry !== 'string' || other === undefined) {
      unknown.push(entry);
      unknownPaths.push(path);
      return;
    }
    if (other.id === target.ref.id) {
      self.push(entry);
      selfPaths.push(path);
      return;
    }
    const otherKey = entry;
    const id = env.ids.relatedReactionId(target.key, otherKey);
    if (id === undefined) return;
    if (!env.relatedMade.has(id)) {
      env.relatedMade.add(id);
      const [from, to] = target.key < otherKey ? [target.ref, other] : [other, target.ref];
      env.relationships.push({
        id: id as Relationship['id'], kind: 'relationship', type: 'related_to', from, to, tags: [], citations: [], provenance: provenanceOf(env.stamp, undefined), review: reviewOf([]),
      });
    }
    cs.consume(['relatedReactions', k], entry);
  });
  if (unknown.length + self.length > 0) {
    // one list under one key: the entries that name no reaction, then the ones that name the reaction itself
    cs.keepListed(['relatedReactions'], [...unknown, ...self], [...unknownPaths, ...selfPaths]);
  }
  if (unknown.length > 0) cs.reason(`relatedReactions names ${unknown.map((entry) => excerpt(entry, 30)).join(', ')}, which is no reaction of this file; kept in legacy.unmapped (no reaction is made for it)`);
  if (self.length > 0) cs.reason('the reaction lists itself in relatedReactions; no relationship is made, the entry is kept in legacy.unmapped');
}
