/**
 * The search rig (step 4.5): a canonical store, a real search host over an in-memory port (every message structured-cloned), the
 * main-side service and the sync wired to the store's ChangeSets, with a manual flush instead of a debounce. Also the query set
 * the incremental-equals-rebuild property compares, and the helpers to compare an index with a fresh one. Test-only.
 */
import type { StoreHandle } from '@/core/commands';
import { indexEngine } from '@/core/indexes/full';
import type { ReadonlyIndexes } from '@/core/indexes/contracts';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { createSearchEngine } from '@/search/engine';
import type { SearchDocument, SearchEngine, SearchHit, SearchQuery } from '@/search/contracts';
import { createSearchHandlers } from '@/workers/search/handlers';
import { createSearchService, type SearchService } from '@/workers/search/service';
import { SEARCH_SPECS } from '@/workers/search/specs';
import { createSearchSync, type SearchSync } from '@/workers/search/sync';
import { createRpcClient, createRpcHost } from '@/workers/rpc';
import type { RpcClient, SearchWorkerApi, WorkerEvent } from '@/workers/rpc/contracts';
import { createMemoryWorkers, type MemoryWorker } from './rpc-memory-port';
import { fullDocuments } from './search-state';

export interface SearchRig {
  readonly store: StoreHandle;
  readonly client: RpcClient<SearchWorkerApi>;
  readonly service: SearchService;
  readonly sync: SearchSync;
  readonly events: WorkerEvent[];
  /** The engine of the CURRENT worker (a restart makes a new one). */
  engine(): SearchEngine;
  workers(): readonly MemoryWorker[];
  /** Loads the whole current state and waits for it. */
  boot(): Promise<void>;
}

export function searchRig(store: StoreHandle, options: { readonly schedule?: (run: () => void) => void; readonly derivedFormulaOf?: (ref: RecordRef) => string | undefined } = {}): SearchRig {
  const engines: SearchEngine[] = [];
  const events: WorkerEvent[] = [];
  const workers = createMemoryWorkers((worker) => {
    const engine = createSearchEngine();
    engines.push(engine);
    void createRpcHost(worker.host, createSearchHandlers(engine));
  });
  const client = createRpcClient<SearchWorkerApi>({ factory: workers.factory, specs: SEARCH_SPECS, options: { onEvent: (event) => events.push(event) } });
  const service = createSearchService({ client });
  // the store keeps the core indexes only; the full ones (topics, relationships) are kept like the app will: apply each change
  let indexes: ReadonlyIndexes = indexEngine.build(store.getState(), store.getRevision());
  const sync = createSearchSync({ state: store.getState, indexes: () => indexes, revision: store.getRevision, service, schedule: options.schedule ?? (() => undefined), ...(options.derivedFormulaOf === undefined ? {} : { derivedFormulaOf: options.derivedFormulaOf }) });
  store.subscribe((changes) => {
    indexes = changes.cause === 'replace' ? indexEngine.build(store.getState(), store.getRevision()) : indexEngine.apply(indexes, changes, store.getState());
    sync.onChange(changes);
  });
  return {
    store,
    client,
    service,
    sync,
    events,
    engine: () => engines[engines.length - 1] as SearchEngine,
    workers: () => workers.workers,
    async boot() {
      sync.reload();
      await sync.flush();
    },
  };
}

const byId = (a: SearchDocument, b: SearchDocument): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The documents an engine holds, through its serialised form. */
export function documentsOf(engine: SearchEngine): SearchDocument[] {
  return [...(JSON.parse(engine.serialize().json) as { documents: SearchDocument[] }).documents].sort(byId);
}

/** An engine loaded with a fresh build of the state's documents. */
export function freshEngine(state: CanonicalState, revision: number, derivedFormulaOf?: (ref: RecordRef) => string | undefined): SearchEngine {
  const engine = createSearchEngine();
  engine.load(fullDocuments(state, revision, derivedFormulaOf), revision);
  return engine;
}

const WORDS = ['ethanol', 'acid', 'reduction', 'carbonyl', 'hydrazine', 'inversion', 'anti', 'markovnikov', 'chapter', 'reaction', 'species', 'class'];

/** Queries drawn from the documents themselves (titles, prefixes, typos, aliases, formulas, structures, body words) and junk. */
export function queriesOf(documents: readonly SearchDocument[], examVersionIds: readonly string[]): SearchQuery[] {
  const texts = new Set<string>(['', ' ', '(', 'x', 'c2h5oh', 'C₂H₅OH', 'α', 'alpha', 'wolffkishner', 'Wolff-Kishner', 'wolff kishner', 'Renamed', 'tag1', 'Added topic', ...WORDS]);
  documents.slice(0, 60).forEach((doc, i) => {
    texts.add(doc.title);
    texts.add(doc.title.slice(0, 4));
    texts.add(doc.title.replace(/(.)(.)/, '$2$1'));
    for (const alias of doc.aliases.slice(0, 2)) texts.add(alias);
    if (doc.formula !== undefined) texts.add(doc.formula);
    if (doc.structureText !== undefined) texts.add(doc.structureText);
    const word = doc.text.split(/\s+/)[i % 5];
    if (word !== undefined) texts.add(word);
    for (const tag of doc.tags.slice(0, 1)) texts.add(tag);
  });
  const queries: SearchQuery[] = [];
  for (const text of texts) {
    queries.push({ text, limit: 50 });
    queries.push({ text, limit: 7, kinds: ['reaction', 'species'], examVersionId: examVersionIds[0] ?? 'exv_none' });
  }
  for (const examVersionId of examVersionIds) {
    queries.push({ text: 'reaction', limit: 40, examVersionId }, { text: '', limit: 40, examVersionId, facets: { scopes: ['official', 'unmapped'] } });
  }
  queries.push(
    { text: '', limit: 30, kinds: ['reaction'] },
    { text: 'reaction', limit: 30, facets: { scopes: ['official'] } },
    { text: '', limit: 30, facets: { topicIds: documents.flatMap((d) => d.facets.topicIds).slice(0, 2), reviewStatus: 'unreviewed' } },
    { text: 'species', limit: 30, facets: { reagentFamilies: documents.flatMap((d) => d.facets.reagentFamilies).slice(0, 2) } },
  );
  return queries;
}

/** The first difference between two engines over a query set, or undefined when every query answers alike (hits and order). */
export function firstDifference(held: SearchEngine, fresh: SearchEngine, queries: readonly SearchQuery[]): string | undefined {
  for (const query of queries) {
    const a: readonly SearchHit[] = held.search(query);
    const b: readonly SearchHit[] = fresh.search(query);
    if (JSON.stringify(a) !== JSON.stringify(b)) return `query ${JSON.stringify(query)}: held ${JSON.stringify(a.slice(0, 5))} vs fresh ${JSON.stringify(b.slice(0, 5))}`;
  }
  return undefined;
}
