/**
 * The ONE interface the search feature needs from outside (step 5.8, as the navigator's and the inspector's ports): the search call
 * (a newer query on the same channel supersedes the older), timers, what the palette keeps (recent searches), the exam version the
 * ranking ties break by, the facts that make a match say what it matched, what opening a result does, the list of commands. `src/app`
 * fills it; the feature imports no `src/app`, no other feature and the engines as types only.
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import type { SearchHit, SearchQuery } from '@/search/contracts';
import type { RecentStore } from '@/ui/state';

/** The answer of `SearchService.search`, as far as the palette reads it. */
export type PaletteSearchAnswer =
  | { readonly ok: true; readonly value: readonly SearchHit[] }
  | { readonly ok: false; readonly code: string; readonly message: string };

/** A command the palette can list. Listed even when it cannot run now, with the reason (`unavailable`). */
export interface PaletteCommand {
  /** Stable, for the list's keys and tests; never shown. */
  readonly id: string;
  readonly title: string;
  /** Other words that find the command ("zoom" finds "Zoom in"); folded like the title. */
  readonly keywords?: readonly string[];
  /** Why the command cannot run now, in words; absent: it can. */
  readonly unavailable?: string;
  run(): void;
}

/** Facts about a hit's record that decide how its match is worded. Absent: the record is gone or has none. */
export interface HitFacts {
  readonly enteredFormula?: string;
  readonly derivedFormula?: string;
}

/** Whether the search index has followed the store: `catching_up` while a change waits to be sent to it, `failed` when it could not follow. */
export type IndexState = { readonly state: 'current' } | { readonly state: 'catching_up' } | { readonly state: 'failed'; readonly reason: string };

export interface SearchPorts {
  search(channel: string, query: SearchQuery): Promise<PaletteSearchAnswer>;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly recent: RecentStore;
  /** The active exam version (for the ranking tie-break), or undefined: no exam scope. */
  examVersionId(): string | undefined;
  /** Whether the index has followed the latest committed change. Absent: always current. An answer from an index that is catching up is never final. */
  indexState?(): IndexState;
  factsOf(ref: RecordRef): HitFacts;
  /** Opens a result: shows it in the inspector and places it (a family on the map, a reaction on its family page). */
  open(ref: RecordRef, title: string): void;
  /** The commands now (asked each time the palette opens and each time a command text changes, so availability is current). */
  commands(): readonly PaletteCommand[];
  readonly log: (type: string, message: string) => void;
}

/** Hits asked for per query; the palette shows these, windowed (SEARCH §4: results are virtualised). */
export const PALETTE_LIMIT = 100;
/** The debounce before a query is sent: inside SEARCH §5's 80 to 120 ms. */
export const PALETTE_DEBOUNCE_MS = 100;
/** While the index is still loading the palette asks again this often, this many times, then says search did not start. */
export const STARTING_RETRY_MS = 500;
export const STARTING_RETRY_MAX = 20;
/** The channel of the palette's queries (the service supersedes per channel). */
export const PALETTE_CHANNEL = 'palette';

export const KIND_TITLES: Readonly<Partial<Record<RecordKind, string>>> = {
  species: 'Species',
  reaction: 'Reactions',
  class: 'Classes',
  reagent: 'Reagents',
  named_reaction: 'Named reactions',
  mechanism: 'Mechanisms',
  topic: 'Topics',
  concept: 'Concepts',
  transformation: 'Transformations',
  caveat: 'Caveats',
  route: 'Routes',
  reference: 'References',
  exam: 'Exams',
  exam_version: 'Exam versions',
};

/** One record's kind in words ("Named reaction"), for a row; the group header uses the plural `kindTitle`. */
export const kindName = (kind: RecordKind): string => `${kind.charAt(0).toUpperCase()}${kind.slice(1).replaceAll('_', ' ')}`;

export const kindTitle = (kind: RecordKind): string => KIND_TITLES[kind] ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1).replaceAll('_', ' ')}`;
