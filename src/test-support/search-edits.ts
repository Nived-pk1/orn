/**
 * Random edits for the search property tests (step 4.5): renames, aliases, tags, lifecycle, notes, creations, deletions and the
 * curriculum edits that move other records' derived data (topic mappings, exam relevance, coverage of an exam version, the topic
 * tree, prerequisites, reagent families), as store commands. The store may refuse an edit (validation); a refused edit is simply
 * not applied. `undo`, `redo` and `replace` are carried out by the caller. Test-only; deterministic from the intent.
 */
import fc from 'fast-check';
import type { CommandContext, CommandEnvelope } from '@/core/commands';
import { REAGENT_FAMILIES, type AnyRecord, type CanonicalState, type RecordKind, type RecordRef } from '@/core/schema';
import { meta } from './demo/kit';
import { resolveIntent } from './arbitraries';

export const SEARCH_OPS = [
  'rename',
  'alias_add',
  'alias_remove',
  'tags',
  'lifecycle',
  'note',
  'create_species',
  'delete',
  'map_create',
  'map_retarget',
  'map_delete',
  'relevance_create',
  'relevance_delete',
  'coverage',
  'topic_reparent',
  'topic_create',
  'topic_delete',
  'prereq_field',
  'families',
  'prereq_rel',
  'undo',
  'redo',
  'replace',
] as const;
export type SearchOp = (typeof SEARCH_OPS)[number];

export interface SearchIntent {
  readonly op: SearchOp;
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

const int = fc.integer({ min: 0, max: 1_000_000 });
export const searchIntentArb: fc.Arbitrary<SearchIntent> = fc.record({ op: fc.constantFrom(...SEARCH_OPS), a: int, b: int, c: int });
export const searchIntentsArb = (maxLength = 30): fc.Arbitrary<SearchIntent[]> => fc.array(searchIntentArb, { minLength: 1, maxLength });

const NAMES = ['ethanol', 'Ethanoic acid', 'Wolff-Kishner reduction', 'C₂H₅OH', 'α-halo ketone', 'Friedel–Crafts acylation', 'benzaldehyde', 'Reimer Tiemann', 'phenol'] as const;
const EDITABLE: readonly RecordKind[] = ['species', 'class', 'reagent', 'reaction', 'concept', 'topic', 'named_reaction', 'transformation'];
const TARGETABLE: readonly RecordKind[] = ['species', 'class', 'reagent', 'reaction', 'concept', 'named_reaction'];

const pick = <T>(items: readonly T[], n: number): T | undefined => (items.length === 0 ? undefined : items[n % items.length]);
const idsOf = (state: CanonicalState, kind: RecordKind): string[] => Object.keys(state.records[kind]).sort();
const at = (state: CanonicalState, kind: RecordKind, id: string): AnyRecord => (state.records[kind] as Readonly<Record<string, AnyRecord>>)[id] as AnyRecord;
const refs = (state: CanonicalState, kinds: readonly RecordKind[]): RecordRef[] => kinds.flatMap((kind) => idsOf(state, kind).map((id) => ({ kind, id }) as RecordRef));
const env = (label: string, ...commands: CommandEnvelope['commands'][number][]): CommandEnvelope => ({ label, commands });
const update = (label: string, record: unknown): CommandEnvelope => env(label, { type: 'record.update', record: record as AnyRecord });
const create = (label: string, record: unknown): CommandEnvelope => env(label, { type: 'record.create', record: record as AnyRecord });
const remove = (ref: RecordRef, mode: 'restrict' | 'apply_cascade'): CommandEnvelope => env(`Delete ${ref.id}`, { type: 'record.delete', ref, mode });
type Loose = Record<string, unknown>;
const loose = (record: AnyRecord): Loose => record as unknown as Loose;

function renameTo(record: AnyRecord, name: string): AnyRecord {
  const r = loose(record);
  return (r.names === undefined ? { ...r, name } : { ...r, names: { ...(r.names as Loose), canonical: name } }) as unknown as AnyRecord;
}

function withAlias(record: AnyRecord, aliases: (old: readonly string[]) => string[]): AnyRecord {
  const r = loose(record);
  return (r.names === undefined
    ? { ...r, aliases: aliases((r.aliases as string[]) ?? []) }
    : { ...r, names: { ...(r.names as Loose), aliases: aliases(((r.names as Loose).aliases as string[]) ?? []) } }) as unknown as AnyRecord;
}

/** The envelope for an intent, 'undo' / 'redo' / 'replace' for the caller to carry out, or undefined when nothing applies. */
export function resolveSearchIntent(state: CanonicalState, intent: SearchIntent, ctx: CommandContext): CommandEnvelope | 'undo' | 'redo' | 'replace' | undefined {
  const { a, b, c } = intent;
  const target = pick(refs(state, EDITABLE), a);
  const record = target === undefined ? undefined : at(state, target.kind, target.id);
  switch (intent.op) {
    case 'undo':
    case 'redo':
    case 'replace':
      return intent.op;
    case 'rename':
      return record === undefined ? undefined : update(`Rename ${record.id}`, renameTo(record, NAMES[c % NAMES.length] as string));
    case 'alias_add':
      return record === undefined ? undefined : update(`Alias ${record.id}`, withAlias(record, (old) => [...old, NAMES[c % NAMES.length] as string, `alias ${c % 7}`]));
    case 'alias_remove':
      return record === undefined ? undefined : update(`Unalias ${record.id}`, withAlias(record, () => []));
    case 'tags':
      return record === undefined ? undefined : update(`Tag ${record.id}`, { ...loose(record), tags: [`tag${c % 5}`, `Tag ${b % 3}`] });
    case 'lifecycle': {
      const review = loose(record as AnyRecord).review as Loose | undefined;
      return record === undefined || review === undefined ? undefined : update(`Lifecycle ${record.id}`, { ...loose(record), review: { ...review, lifecycle: review.lifecycle === 'draft' ? 'published' : 'draft' } });
    }
    case 'note':
      return record === undefined ? undefined : update(`Note ${record.id}`, { ...loose(record), notes: `note about ${NAMES[c % NAMES.length]} ${c % 11}` });
    case 'create_species':
      return resolveIntent(state, { op: 'create_species', a, b, c }, ctx);
    case 'delete': {
      const any = pick(refs(state, [...EDITABLE, 'topic_mapping', 'exam_relevance', 'relationship', 'exam_version']), a);
      return any === undefined ? undefined : remove(any, c % 2 === 0 ? 'apply_cascade' : 'restrict');
    }
    case 'map_create': {
      const topic = pick(idsOf(state, 'topic'), a);
      const to = pick(refs(state, TARGETABLE), b);
      if (topic === undefined || to === undefined) return undefined;
      return create('Map to topic', { id: ctx.newId('tmp'), kind: 'topic_mapping', topicId: topic, target: to, role: c % 3 === 0 ? 'enrichment' : 'core', ...meta() });
    }
    case 'map_retarget': {
      const mapping = pick(idsOf(state, 'topic_mapping'), a);
      const to = pick(refs(state, TARGETABLE), b);
      if (mapping === undefined || to === undefined) return undefined;
      return update('Retarget mapping', { ...loose(at(state, 'topic_mapping', mapping)), target: to, ...(c % 2 === 0 ? { topicId: pick(idsOf(state, 'topic'), c) } : {}) });
    }
    case 'map_delete': {
      const mapping = pick(idsOf(state, 'topic_mapping'), a);
      return mapping === undefined ? undefined : remove({ kind: 'topic_mapping', id: mapping } as RecordRef, 'restrict');
    }
    case 'relevance_create': {
      const exam = pick(idsOf(state, 'exam'), 0);
      const to = pick(refs(state, TARGETABLE), a);
      if (exam === undefined || to === undefined) return undefined;
      const versions = idsOf(state, 'exam_version').filter((id) => (at(state, 'exam_version', id) as unknown as { examId: string }).examId === exam);
      const scoped = c % 3 === 0 ? [] : versions.slice(0, 1 + (b % 2));
      return create('Exam relevance', { id: ctx.newId('erl'), kind: 'exam_relevance', target: to, examId: exam, examVersionIds: scoped, scope: (['official', 'prerequisite', 'enrichment', 'outside'] as const)[c % 4], ...meta() });
    }
    case 'relevance_delete': {
      const relevance = pick(idsOf(state, 'exam_relevance'), a);
      return relevance === undefined ? undefined : remove({ kind: 'exam_relevance', id: relevance } as RecordRef, 'restrict');
    }
    case 'coverage': {
      const version = pick(idsOf(state, 'exam_version'), a);
      const topic = pick(idsOf(state, 'topic'), b);
      if (version === undefined || topic === undefined) return undefined;
      const old = loose(at(state, 'exam_version', version));
      const units = (old.units as { topicCoverage: { topicId: string; coverage: string }[] }[]).map((unit, i) =>
        i > 0 ? unit : { ...unit, topicCoverage: [...unit.topicCoverage.filter((tc) => tc.topicId !== topic), ...(c % 4 === 3 ? [] : [{ topicId: topic, coverage: (['included', 'partial', 'excluded'] as const)[c % 3] as string }])] },
      );
      return update('Coverage', { ...old, units });
    }
    case 'topic_reparent': {
      const topic = pick(idsOf(state, 'topic').filter((id) => (loose(at(state, 'topic', id)).parentId as string | undefined) !== undefined), a);
      if (topic === undefined) return undefined;
      const old = loose(at(state, 'topic', topic));
      const others = idsOf(state, 'topic').filter((id) => id !== topic && (loose(at(state, 'topic', id)).parentId as string | undefined) === undefined);
      const { parentId: _gone, ...rest } = old;
      void _gone;
      const parent = c % 3 === 0 ? undefined : pick(others, b);
      return update('Reparent topic', parent === undefined ? rest : { ...rest, parentId: parent });
    }
    case 'topic_create': {
      const root = pick(idsOf(state, 'topic').filter((id) => (loose(at(state, 'topic', id)).parentId as string | undefined) === undefined), a);
      return create('New topic', { id: ctx.newId('top'), kind: 'topic', name: `Added topic ${c % 9}`, aliases: [], ...(root === undefined ? {} : { parentId: root }), topicKind: 'chapter', order: 50 + (c % 9), ...meta() });
    }
    case 'topic_delete': {
      const topic = pick(idsOf(state, 'topic'), a);
      return topic === undefined ? undefined : remove({ kind: 'topic', id: topic } as RecordRef, c % 2 === 0 ? 'apply_cascade' : 'restrict');
    }
    case 'prereq_field': {
      const owner = pick(refs(state, ['reaction', 'named_reaction']), a);
      const concept = pick(idsOf(state, 'concept'), b);
      if (owner === undefined) return undefined;
      return update('Prerequisites', { ...loose(at(state, owner.kind, owner.id)), prerequisiteConceptIds: c % 3 === 0 || concept === undefined ? [] : [concept] });
    }
    case 'families': {
      const reagent = pick(idsOf(state, 'reagent'), a);
      if (reagent === undefined) return undefined;
      return update('Reagent families', { ...loose(at(state, 'reagent', reagent)), families: c % 4 === 3 ? [] : [REAGENT_FAMILIES[c % REAGENT_FAMILIES.length], REAGENT_FAMILIES[(c + b) % REAGENT_FAMILIES.length]].filter((f, i, all) => all.indexOf(f) === i) });
    }
    case 'prereq_rel': {
      const from = pick(idsOf(state, 'concept'), a);
      const to = pick(refs(state, ['reaction', 'named_reaction']), b);
      if (from === undefined || to === undefined) return undefined;
      return create('Prerequisite', { id: ctx.newId('rel'), kind: 'relationship', type: 'prerequisite_of', from: { kind: 'concept', id: from }, to, ...meta() });
    }
  }
}
