/**
 * The concepts, named reactions and topics a legacy import needs (step 3.11b, docs/MIGRATION.md §4.2 and §4.5). A legacy text is
 * resolved in this order: (1) a record of the LIVE dataset (the injected `LegacyMatchContext`) with that folded name or alias;
 * (2) a record this import already created for that folded text; (3) a new record, published and `review_required` (nobody has
 * checked it). One record per folded text: the ID space keys concept, named-reaction and topic IDs by the folded text.
 *
 * Concepts are matched within their kind when the legacy field says which kind it is (`reaction_type`, `mechanism_class`,
 * `reaction_family`); a concept written under another kind in the dataset is not reused for that role and the new record says so.
 * A context record whose ID is one this import would create itself (its own earlier output, found again on a re-import) is not a match:
 * the record is created again, identical, so a re-import resolves every record as `identical_skip`.
 * The `general` kind (prerequisites, concepts) reuses a concept of any kind. Several dataset matches: the first by record ID, and
 * the returned `note` says so (the reaction carries it as a review reason).
 */
import { LabelTextSchema, type Concept, type NamedReaction, type Topic } from '@/core/schema';
import { fold } from '@/core/text';
import { provenanceOf, reviewOf, type Stamp } from './compound-records';
import { excerpt } from './compound-scope';
import type { LegacyIdSpace } from './id-space';
import type { ConceptKind, MatchIndex, MatchRecord } from './match-context';

export interface Resolved {
  readonly id: string;
  /** A reason the REACTION using the record should carry (an ambiguous match), else undefined. */
  readonly note?: string;
}

export interface CreatedClassification {
  readonly concept: Concept[];
  readonly named_reaction: NamedReaction[];
  readonly topic: Topic[];
}

export interface ClassificationBook {
  concept(text: string, kind: ConceptKind, field: string): Resolved;
  namedReaction(text: string): Resolved;
  topic(text: string): Resolved;
  /** The records created so far, in creation order, with their review reasons; `report` is told by the caller (`created`). */
  records(): CreatedClassification;
}

interface Draft<T> {
  readonly record: T;
  readonly reasons: string[];
}

export interface BookInput {
  readonly ids: LegacyIdSpace;
  readonly index: MatchIndex;
  readonly stamp: Stamp;
}

const legacyIdOf = (text: string): string | undefined => (LabelTextSchema.safeParse(text).success ? text : undefined);

function ambiguity(what: string, text: string, found: readonly MatchRecord[]): string | undefined {
  return found.length > 1 ? `${found.length} ${what}s of the dataset are named ${excerpt(text)}; the first by ID (${found[0]?.id}) was used` : undefined;
}

export function createClassificationBook(input: BookInput): ClassificationBook {
  const { ids, index, stamp } = input;
  const concepts = new Map<string, Draft<Concept>>();
  const namedReactions = new Map<string, Draft<NamedReaction>>();
  const topics = new Map<string, Draft<Topic>>();
  /** Folded text → IDs of the concepts this import created for it (one per kind). */
  const createdByText = new Map<string, string[]>();

  const provenance = (text: string) => provenanceOf(stamp, legacyIdOf(text));

  return {
    concept(text, kind, field) {
      const folded = fold(text);
      // records this very import would create (same deterministic IDs) are never "matches": a re-import must produce the same records
      const own = new Set(ids.conceptIdsOf(text));
      const found = index.find('concept', folded).filter((candidate) => !own.has(candidate.id));
      const usable = kind === 'general' ? found : found.filter((candidate) => candidate.conceptKind === kind);
      const first = usable[0];
      if (first !== undefined) return { id: first.id, ...noteOf(ambiguity('concept', text, usable)) };
      // kind-specific roles: the ID is keyed by kind and text, so one text under two kinds is two concepts (step 3.11b review);
      // the generic roles reuse a concept of that name of any kind made earlier in this import (the first by ID says so)
      if (kind === 'general') {
        const earlier = (createdByText.get(folded) ?? []).slice().sort();
        const one = earlier[0];
        if (one !== undefined) return { id: one, ...(earlier.length > 1 ? { note: `${earlier.length} concepts created by this import are named ${excerpt(text)}; the first by ID (${one}) was used` } : {}) };
      }
      const id = kind === 'general' ? ids.conceptId(text) : ids.conceptId(text, kind);
      if (concepts.has(id)) return { id };
      const reasons = [`created from the legacy ${field} text ${excerpt(text)}: no concept with this name in the file or the dataset`];
      if (found.length > 0) reasons.push(`the dataset has a concept named ${excerpt(text)} of another kind (${found[0]?.conceptKind}); it was not reused for a ${kind} role`);
      createdByText.set(folded, [...(createdByText.get(folded) ?? []), id]);
      concepts.set(id, {
        reasons,
        record: {
          id: id as Concept['id'], kind: 'concept', name: text, aliases: [], conceptKind: kind, parentIds: [], tags: [], citations: [], provenance: provenance(text),
          review: reviewOf([]),
        },
      });
      return { id };
    },

    namedReaction(text) {
      const found = index.find('named_reaction', fold(text)).filter((candidate) => candidate.id !== ids.namedReactionId(text));
      const first = found[0];
      if (first !== undefined) return { id: first.id, ...noteOf(ambiguity('named reaction', text, found)) };
      const id = ids.namedReactionId(text);
      if (!namedReactions.has(id)) {
        namedReactions.set(id, {
          reasons: [`created from the legacy namedReaction text ${excerpt(text)}: no named reaction with this name in the file or the dataset`],
          record: {
            id: id as NamedReaction['id'], kind: 'named_reaction', name: text, aliases: [], parentIds: [], conceptIds: [], prerequisiteConceptIds: [], tags: [], citations: [],
            provenance: provenance(text), review: reviewOf([]),
          },
        });
      }
      return { id };
    },

    topic(text) {
      const found = index.find('topic', fold(text)).filter((candidate) => candidate.id !== ids.topicId(text));
      // a chapter sits under a subject: a match that has a parent is preferred to a root topic of the same name
      const first = found.find((candidate) => candidate.parentId !== undefined) ?? found[0];
      if (first !== undefined) return { id: first.id, ...noteOf(ambiguity('topic', text, found)) };
      const id = ids.topicId(text);
      if (!topics.has(id)) {
        topics.set(id, {
          reasons: [`created as a chapter (no parent) from the legacy chapter text ${excerpt(text)}: no topic with this name in the file or the dataset; place it in the topic tree`],
          record: {
            id: id as Topic['id'], kind: 'topic', name: text, aliases: [], topicKind: 'chapter', order: topics.size + 1, tags: [], citations: [], provenance: provenance(text),
            review: reviewOf([]),
          },
        });
      }
      return { id };
    },

    records() {
      const finish = <T extends { review: unknown }>(drafts: Map<string, Draft<T>>): T[] =>
        [...drafts.values()].map(({ record, reasons }) => ({ ...record, review: reviewOf(reasons) }));
      return { concept: finish(concepts), named_reaction: finish(namedReactions), topic: finish(topics) };
    },
  };
}

const noteOf = (note: string | undefined): { note?: string } => (note === undefined ? {} : { note });
