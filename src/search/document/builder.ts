/**
 * The pure document builder (step 4.5, SEARCH §1 and §3). `buildDocument(record, ports)` turns one record into a
 * `SearchDocument`, or `undefined` for a kind that is not indexed.
 *
 * WHAT A DOCUMENT CONTAINS, kind by kind (see `parts.ts`; every kind: title, names, aliases, entered formula, tags, plain text of
 * its own rich text, lifecycle and review status):
 *   species        names (canonical, display, IUPAC, common) and aliases; entered formula; structure text; isotope note, stereo
 *                  descriptors and note, property labels/values/notes, acid-base, study and general notes
 *   class          names and aliases; formula text and general formula (as the formula); generic structure; R-group note,
 *                  description, study notes, notes
 *   reagent        names; aliases AND its profiles' labels and aliases; formula text; profile behaviours, description, notes
 *   reaction       name and aliases; generalised equation; participants', stages', variants', outcomes', products' and
 *                  intermediates' own labels, original wording and notes; reversibility, selectivity, limitations and notes
 *   named_reaction name, aliases; summary, typical conditions, notes     concept: name, aliases; summary, notes
 *   transformation name, aliases; equation text, bond change summary, description, notes
 *   mechanism      name, aliases; summary; variants' labels, rate laws, applicability; steps' titles and descriptions; notes
 *   caveat         title; rule, statement, trigger, explanation, notes      route: name; description; steps' notes; notes
 *   topic          name, aliases; summary, notes        reference: title; authors, edition, publisher, identifier, year; notes
 * NOT indexed (SEARCH §1): relationships, exams, exam versions, topic mappings, exam relevance, assets, presentation records.
 *
 * A document NEVER contains text of ANOTHER record: ids stay ids (a reaction does not carry its participants' names). What it
 * does read from elsewhere is DERIVED DATA, never indexed as text: `scopeRanks` and `facets.scopes` (core's `scopeOf` per exam
 * version), `facets.topicIds` (topic mappings and the topic tree) and, for a reaction, `facets.reagentFamilies` (the families of
 * its reagent participants). `src/workers/search/fanout.ts` refreshes a document when one of those changes.
 * The entered formula, and for a species the formula the chem worker derived from its structure (`derivedFormula`, from the port
 * `derivedFormulaOf`; absent until the L4 service has read the structure; step 5.1b).
 */
import type { AnyRecord, ExamScope, RecordKind } from '@/core/schema';
import { SCOPE_NAMES, type ScopeRank, type SearchDocument } from '../contracts';
import type { DocumentPorts } from './ports';
import { distinct } from './pieces';
import { partOf } from './parts';

/** The kinds that have a document (SEARCH §1). */
export const SEARCH_KINDS = [
  'species',
  'class',
  'reagent',
  'reaction',
  'named_reaction',
  'concept',
  'mechanism',
  'transformation',
  'caveat',
  'route',
  'topic',
  'reference',
] as const satisfies readonly RecordKind[];

const SEARCHABLE: ReadonlySet<string> = new Set(SEARCH_KINDS);
export const isSearchKind = (kind: string): boolean => SEARCHABLE.has(kind);

const RANK_OF: Readonly<Record<ExamScope, ScopeRank>> = { official: 0, prerequisite: 1, enrichment: 2, outside: 3 };

export function buildDocument(record: AnyRecord, ports: DocumentPorts): SearchDocument | undefined {
  const part = partOf(record);
  if (part === undefined || !('review' in record)) return undefined;
  const ref = { kind: record.kind, id: record.id };
  const scopeRanks: Record<string, ScopeRank> = {};
  for (const version of ports.versions) {
    const scope = version.scopeOf(ref);
    if (scope !== 'unmapped') scopeRanks[version.id] = RANK_OF[scope];
  }
  const ranks = new Set(Object.values(scopeRanks));
  const reagentFamilies =
    record.kind === 'reagent'
      ? record.families
      : record.kind === 'reaction'
        ? record.participants.flatMap((participant) => (participant.ref.kind === 'reagent' ? (ports.reagentOf(participant.ref.id)?.families ?? []) : []))
        : [];
  const { text, textTruncated } = part.pieces.finish();
  const known = record.kind === 'species' ? ports.derivedFormulaOf(ref)?.trim() : undefined;
  const derived = known === undefined || known === '' ? undefined : known;
  return {
    id: record.id,
    kind: record.kind,
    title: part.title,
    names: part.names,
    aliases: part.aliases,
    ...(part.formula === undefined ? {} : { formula: part.formula }),
    ...(derived === undefined ? {} : { derivedFormula: derived }),
    ...(part.structureText === undefined ? {} : { structureText: part.structureText }),
    text,
    textTruncated,
    tags: distinct(record.tags),
    lifecycle: record.review.lifecycle,
    scopeRanks,
    facets: {
      reagentFamilies: [...new Set(reagentFamilies)].sort(),
      topicIds: ports.topicIdsOf(ref),
      scopes: SCOPE_NAMES.filter((_, rank) => ranks.has(rank as ScopeRank)),
      reviewStatus: record.review.status,
    },
  };
}
