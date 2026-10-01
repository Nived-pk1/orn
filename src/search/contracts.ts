/**
 * Search contracts — docs/SEARCH.md. MiniSearch in the search worker, fed incrementally from
 * ChangeSets. Folding/tokenising comes from src/core/text so validation and search agree.
 * Step 4.5 (Phase 4 contract decisions Q6): documents carry exam-scope ranks and a lifecycle as DATA (never indexed as text),
 * updates carry `fromRevision` and `apply` answers a value, the index serialises, a newer query supersedes an older one.
 */
import type { RecordKind, RecordRef } from '@/core/schema';

/** Characters of `SearchDocument.text` (SEARCH §3). A longer text is cut and the document says so (`textTruncated`). */
export const SEARCH_TEXT_CAP = 4_000;
/** Longest query text and most words the engine accepts; the palette parser cuts to them and says so. */
export const MAX_QUERY_CHARS = 1_000;
export const MAX_QUERY_WORDS = 16;
/** Most hits one query may ask for. */
export const MAX_SEARCH_LIMIT = 200;

/** Exam scope as a rank, best first (SEARCH §3 ties; JEE_ONTOLOGY §4). A record the version does not map has no rank. */
export type ScopeRank = 0 | 1 | 2 | 3;
export const SCOPE_NAMES = ['official', 'prerequisite', 'enrichment', 'outside'] as const;
export type ScopeName = (typeof SCOPE_NAMES)[number];
/** Rank used for ordering when a document has none for the active exam version (after `outside`). */
export const UNRANKED = 4;

export type Lifecycle = 'draft' | 'published';

export interface SearchDocument {
  /** The record's id (unique across kinds). */
  readonly id: string;
  readonly kind: RecordKind;
  readonly title: string;
  /**
   * Canonical, display, IUPAC and common names (boost 4, prefix search). Aliases are separate (`aliases`) so a hit can say it
   * matched an alias. Every variant is searchable; the core normaliser makes "C2H5OH" and "C₂H₅OH" one token.
   */
  readonly names: readonly string[];
  /** Aliases (and, for a reagent, its profiles' labels and aliases): boost 4, prefix search, reported as `alias`. */
  readonly aliases: readonly string[];
  /** Entered formula (boost 3), exact token match, no prefix, no fuzzy. */
  readonly formula?: string;
  /** Exact-match only (after trim); substructure search is architecturally supported, not required now. */
  readonly structureText?: string;
  /** Secondary text (summaries, notes), capped at `SEARCH_TEXT_CAP` characters per document (boost 1). */
  readonly text: string;
  /** True when `text` was cut at the cap. */
  readonly textTruncated: boolean;
  readonly tags: readonly string[];
  readonly lifecycle: Lifecycle;
  /** Exam version id to the rank of this record's derived scope under it. Data for ordering and the scope facet; not indexed. */
  readonly scopeRanks: Readonly<Record<string, ScopeRank>>;
  readonly facets: {
    /** Reagent: its own families. Reaction: the families of its reagent participants. Otherwise empty. Sorted. */
    readonly reagentFamilies: readonly string[];
    /** Topics that map to the record, and their ancestors (a topic: itself and its ancestors). Sorted. */
    readonly topicIds: readonly string[];
    /** Distinct scope names the record has under any exam version, best first (`SCOPE_NAMES` order). */
    readonly scopes: readonly string[];
    readonly reviewStatus: string;
  };
}

export interface SearchQuery {
  readonly text: string;
  readonly kinds?: readonly RecordKind[];
  /**
   * Filters: within one facet any listed value matches, across facets all must. An empty list is no constraint. With
   * `examVersionId` the `scopes` filter is read under that version (`unmapped` matches a record it gives no rank).
   */
  readonly facets?: Partial<SearchDocument['facets']>;
  /** The active exam version, for the scope tie-break (official first) and the scope filter. */
  readonly examVersionId?: string;
  /** 1 to `MAX_SEARCH_LIMIT`. */
  readonly limit: number;
}

export interface SearchHit {
  readonly ref: RecordRef;
  /** Rounded to 9 decimals so two indexes with the same documents give the same number. */
  readonly score: number;
  readonly title: string;
  readonly matchedField: 'name' | 'alias' | 'formula' | 'structure' | 'text' | 'tag';
  readonly matchedText?: string;
}

export interface SearchIndexUpdate {
  /** The revision the index must be at for this update to apply (the previous update's `revision`, or the load's). */
  readonly fromRevision: number;
  /** The revision of the state the documents were built from. */
  readonly revision: number;
  /** Removals are applied first, then upserts (an id in both ends up present). */
  readonly upsert: readonly SearchDocument[];
  readonly remove: readonly string[];
}

/** `have` is the revision the worker's index is at; -1 when nothing is loaded (a fresh or restarted worker). */
export type ApplyAnswer =
  | { readonly ok: true; readonly revision: number; readonly upserted: number; readonly removed: number }
  | { readonly ok: false; readonly code: 'REVISION_MISMATCH'; readonly have: number };

export interface SerializedSearchIndex {
  readonly revision: number;
  readonly json: string;
}

export type LoadSerializedAnswer =
  | { readonly ok: true; readonly revision: number; readonly documents: number }
  | { readonly ok: false; readonly code: 'BAD_INDEX'; readonly message: string };

/** The index itself (pure over MiniSearch); the worker's handlers and the tests drive it directly. */
export interface SearchEngine {
  /** Revision of the loaded index, or -1 when nothing is loaded. */
  readonly revision: number;
  load(documents: readonly SearchDocument[], revision: number): void;
  apply(update: SearchIndexUpdate): ApplyAnswer;
  search(query: SearchQuery): readonly SearchHit[];
  serialize(): SerializedSearchIndex;
  loadSerialized(index: SerializedSearchIndex): LoadSerializedAnswer;
  /** Documents in the index. */
  size(): number;
}
