/**
 * The words that name a relationship in a history label and an editor title (step 6.6c part A, L3): both ends, in the schema's own
 * words for the type, each name cut past `NAME_WORDS_MAX` characters. Pure; no chemistry.
 */
import { RELATIONSHIP_TYPE_SPECS, type AnyRecord, type CanonicalState, type RecordRef, type RelationshipType } from '../schema';
import { recordAt } from '../commands/lookup';

export const NAME_WORDS_MAX = 40;

/** A name for a label: as it is up to 40 characters, else its first 40 characters and "...". */
export const shortName = (name: string): string => (name.length > NAME_WORDS_MAX ? `${name.slice(0, NAME_WORDS_MAX)}...` : name);

/** "<A> commonly confused with <B>": the type's label from the first end to the second. An unknown type is said with its raw words. */
export function relationshipWords(type: string, from: string, to: string): string {
  const label = Object.hasOwn(RELATIONSHIP_TYPE_SPECS, type) ? RELATIONSHIP_TYPE_SPECS[type as RelationshipType].label : type.replace(/_/g, ' ');
  return `${shortName(from)} ${label} ${shortName(to)}`;
}

/**
 * Records with no name of their own are named by what they join (step 6.6c): a topic mapping by its record and topic, an exam relevance by
 * its record and exam, a map family by its label or its class. Undefined for any other kind or while a part is not chosen.
 */
export function composedName(state: CanonicalState, record: AnyRecord): string | undefined {
  if (record.kind === 'topic_mapping') return `${shortName(nameOfRef(state, record.target))} in ${shortName(state.records.topic[record.topicId]?.name ?? record.topicId)}`;
  if (record.kind === 'exam_relevance') return `${shortName(nameOfRef(state, record.target))} for ${shortName(state.records.exam[record.examId]?.name ?? record.examId)}`;
  if (record.kind === 'navigator_anchor') return shortName(record.label ?? nameOfRef(state, record.target));
  return undefined;
}

/** The name of a stored record for a label (its canonical name, name or title), or its ID. */
export function nameOfRef(state: CanonicalState, ref: RecordRef): string {
  const fields = recordAt(state, ref) as { names?: { canonical?: unknown }; name?: unknown; title?: unknown } | undefined;
  const own = fields?.names?.canonical ?? fields?.name ?? fields?.title;
  return typeof own === 'string' && own !== '' ? own : ref.id;
}
