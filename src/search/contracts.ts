/**
 * Search contracts — docs/SEARCH.md. MiniSearch in the search worker, fed incrementally from
 * ChangeSets. Folding/tokenising comes from src/core/text so validation and search agree.
 */
import type { RecordKind, RecordRef } from '@/core/schema';

export interface SearchDocument {
  readonly id: string;
  readonly kind: RecordKind;
  readonly title: string;
  /** Canonical, display, IUPAC, common names and aliases (all variants searchable). */
  readonly names: readonly string[];
  readonly formula?: string;
  /** Exact-match only (after trimming); substructure search is architecturally supported, not required now. */
  readonly structureText?: string;
  /** Secondary text (summaries, notes), capped at 4,000 characters per document. */
  readonly text: string;
  readonly tags: readonly string[];
  readonly facets: {
    readonly reagentFamilies: readonly string[];
    readonly topicIds: readonly string[];
    readonly scopes: readonly string[];
    readonly reviewStatus: string;
  };
}

export interface SearchQuery {
  readonly text: string;
  readonly kinds?: readonly RecordKind[];
  readonly facets?: Partial<SearchDocument['facets']>;
  readonly limit: number;
}

export interface SearchHit {
  readonly ref: RecordRef;
  readonly score: number;
  readonly title: string;
  readonly matchedField: 'name' | 'alias' | 'formula' | 'structure' | 'text' | 'tag';
  readonly matchedText?: string;
}

export interface SearchIndexUpdate {
  readonly revision: number;
  readonly upsert: readonly SearchDocument[];
  readonly remove: readonly string[];
}

export interface SearchService {
  load(documents: readonly SearchDocument[], revision: number): Promise<void>;
  apply(update: SearchIndexUpdate): Promise<void>;
  search(query: SearchQuery, signal?: AbortSignal): Promise<readonly SearchHit[]>;
}
