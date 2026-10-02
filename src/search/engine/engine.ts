/**
 * The search index (step 4.5, ADR-011): MiniSearch behind the `SearchEngine` contract. This is the only folder that imports
 * minisearch. It holds the documents (for filters, titles and removal) next to MiniSearch's index and keeps both in step.
 *
 * Removing a document uses MiniSearch's `remove` (not `discard`): `discard` leaves the old postings in the index until a vacuum,
 * and their document counts would then depend on the history of updates and searches; `remove` makes the index a function of
 * the documents it holds. Documents are added in id order on a load, so a full build is canonical.
 */
import MiniSearch from 'minisearch';
import { MAX_SEARCH_LIMIT, type ApplyAnswer, type LoadSerializedAnswer, type SearchDocument, type SearchEngine, type SearchHit, type SearchQuery, type SerializedSearchIndex } from '../contracts';
import { MINISEARCH_OPTIONS, type MiniDoc } from './config';
import { buildQuery } from './query';
import { compareCandidates, describeMatch, filterOf, foldedTitle, roundScore, type Candidate, type Entry } from './rank';
import { decodeIndex, encodeIndex } from './serialize';
import { checkDocument, checkQuery } from './validate';

/** `search` was called before anything was loaded. The worker answers `NOT_READY`. */
export class SearchNotLoaded extends Error {
  constructor() {
    super('no search index is loaded');
    this.name = 'SearchNotLoaded';
  }
}

const lines = (values: readonly string[]): string => values.join('\n');

/** What MiniSearch indexes for a document. */
export function miniDocOf(doc: SearchDocument): MiniDoc {
  return {
    id: doc.id,
    name: lines(doc.names),
    alias: lines(doc.aliases),
    formula: lines([doc.formula ?? '', doc.derivedFormula ?? ''].filter((value) => value !== '')),
    structure: doc.structureText ?? '',
    tags: lines(doc.tags),
    text: doc.text,
  };
}

const byId = (a: SearchDocument, b: SearchDocument): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function createSearchEngine(): SearchEngine {
  let index = new MiniSearch<MiniDoc>(MINISEARCH_OPTIONS);
  let entries = new Map<string, Entry>();
  let revision = -1;

  const entryOf = (doc: SearchDocument): Entry => ({ doc, folded: foldedTitle(doc) });

  function replaceAll(documents: readonly SearchDocument[], next: MiniSearch<MiniDoc> | undefined, at: number): void {
    const sorted = [...documents].sort(byId);
    const fresh = next ?? new MiniSearch<MiniDoc>(MINISEARCH_OPTIONS);
    if (next === undefined) fresh.addAll(sorted.map(miniDocOf));
    index = fresh;
    entries = new Map(sorted.map((doc) => [doc.id, entryOf(doc)] as const));
    revision = at;
  }

  function search(query: SearchQuery): readonly SearchHit[] {
    if (revision < 0) throw new SearchNotLoaded();
    const problem = checkQuery(query);
    if (problem !== undefined) throw new RangeError(problem);
    const passes = filterOf(query);
    const filtering = (query.kinds?.length ?? 0) > 0 || query.facets !== undefined;
    const tree = buildQuery(query.text);
    // no word to look for: with a filter this lists what the filter admits (a palette prefix alone), without one nothing
    if (tree === undefined && !filtering) return [];
    const candidates: Candidate[] = [];
    if (tree === undefined) {
      for (const entry of entries.values()) if (passes(entry)) candidates.push({ entry, score: 0, match: {} });
    } else {
      const results = index.search(tree, { filter: (result) => passes(entries.get(result.id) as Entry) });
      for (const result of results) candidates.push({ entry: entries.get(result.id) as Entry, score: roundScore(result.score), match: result.match });
    }
    candidates.sort((a, b) => compareCandidates(a, b, query.examVersionId));
    return candidates.slice(0, Math.min(query.limit, MAX_SEARCH_LIMIT)).map(({ entry, score, match }) => ({
      ref: { kind: entry.doc.kind, id: entry.doc.id },
      score,
      title: entry.doc.title,
      ...describeMatch(entry.doc, match),
    }));
  }

  return {
    get revision() {
      return revision;
    },
    size: () => entries.size,
    load(documents, at) {
      const seen = new Set<string>();
      for (const doc of documents) {
        const problem = checkDocument(doc);
        if (problem !== undefined) throw new TypeError(problem);
        if (seen.has(doc.id)) throw new TypeError(`document ${doc.id} appears twice`);
        seen.add(doc.id);
      }
      replaceAll(documents, undefined, at);
    },
    apply(update): ApplyAnswer {
      if (revision < 0 || update.fromRevision !== revision) return { ok: false, code: 'REVISION_MISMATCH', have: revision };
      const upserted = new Set<string>();
      for (const doc of update.upsert) {
        const problem = checkDocument(doc);
        if (problem !== undefined) throw new TypeError(problem);
        if (upserted.has(doc.id)) throw new TypeError(`document ${doc.id} is upserted twice`);
        upserted.add(doc.id);
      }
      if (update.revision < update.fromRevision) throw new RangeError('an update cannot go back in revision');
      let removed = 0;
      for (const id of update.remove) {
        const old = entries.get(id);
        if (old === undefined) continue;
        index.remove(miniDocOf(old.doc));
        entries.delete(id);
        removed += 1;
      }
      for (const doc of [...update.upsert].sort(byId)) {
        const old = entries.get(doc.id);
        if (old !== undefined) index.remove(miniDocOf(old.doc));
        index.add(miniDocOf(doc));
        entries.set(doc.id, entryOf(doc));
      }
      revision = update.revision;
      return { ok: true, revision, upserted: update.upsert.length, removed };
    },
    search,
    serialize(): SerializedSearchIndex {
      if (revision < 0) throw new SearchNotLoaded();
      return { revision, json: encodeIndex(index, [...entries.values()].map((entry) => entry.doc).sort(byId), revision) };
    },
    loadSerialized(serialized): LoadSerializedAnswer {
      const decoded = decodeIndex(serialized.json, serialized.revision);
      if (!decoded.ok) return { ok: false, code: 'BAD_INDEX', message: decoded.message };
      replaceAll(decoded.documents, decoded.index, serialized.revision);
      return { ok: true, revision: serialized.revision, documents: entries.size };
    },
  };
}
