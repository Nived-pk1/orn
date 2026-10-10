/**
 * Plain-text names of records for the inspector (step 5.6a). Presentation text only: no chemistry is decided here. A record that is
 * gone is written by its ID and said to be missing by the caller; nothing is guessed.
 */
import type { AnyRecord, CanonicalState, RecordRef } from '@/core/schema';
import { recordKindOfId } from '@/core/schema';

type Loose = Readonly<Record<string, unknown>>;
const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

export const KIND_WORD: Readonly<Record<string, string>> = {
  species: 'species',
  class: 'class',
  reagent: 'reagent',
  reaction: 'reaction',
  named_reaction: 'named reaction',
  mechanism: 'mechanism',
  concept: 'concept',
  transformation: 'transformation',
  caveat: 'caveat',
  route: 'route',
  relationship: 'relationship',
  reference: 'reference',
  topic: 'topic',
  topic_mapping: 'topic mapping',
  exam: 'exam',
  exam_version: 'exam version',
  exam_relevance: 'exam relevance',
  asset: 'asset',
  navigator_anchor: 'navigator anchor',
  reaction_scheme: 'reaction scheme',
  view_preset: 'saved view',
  entity_display: 'display choice',
};

export const kindWord = (kind: string): string => KIND_WORD[kind] ?? kind.replaceAll('_', ' ');

export const recordOf = (state: CanonicalState, ref: RecordRef): AnyRecord | undefined =>
  (state.records[ref.kind] as Readonly<Record<string, AnyRecord>> | undefined)?.[ref.id];

/** The record a bare ID names, by its prefix; undefined when the prefix is unknown. */
export function refOfId(id: string): RecordRef | undefined {
  const kind = recordKindOfId(id);
  return kind === undefined ? undefined : ({ kind, id } as RecordRef);
}

/** Display name: names.display, names.canonical, name, title, label, statement, else the ID. */
export function nameOfRecord(record: AnyRecord): string {
  const loose = record as unknown as Loose;
  const names = loose.names as Loose | undefined;
  return text(names?.display) ?? text(names?.canonical) ?? text(loose.name) ?? text(loose.title) ?? text(loose.label) ?? text(loose.id) ?? '';
}

export function nameOf(state: CanonicalState, ref: RecordRef): string {
  const record = recordOf(state, ref);
  return record === undefined ? ref.id : nameOfRecord(record);
}

/** The entered formula of a species, the formula text of a class or reagent, else undefined. */
export function formulaOf(record: AnyRecord): string | undefined {
  const loose = record as unknown as Loose;
  const generic = loose.generic as Loose | undefined;
  return text(loose.formula) ?? text(loose.formulaText) ?? text(generic?.formulaText) ?? text(generic?.generalFormula);
}
