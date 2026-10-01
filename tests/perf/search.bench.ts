/**
 * Step 4.5 (docs/PERFORMANCE_ARCHITECTURE.md §2 row "Search query < 50 ms (worker)", SEARCH §5 "full index build < 1.5 s at 5k
 * reactions in the worker"): the search engine on the design tier (5,000 reactions, 2,000 other entities, 10 topics, two exam
 * versions, formulas on the species), worker code in Node, no RPC. Queries: a name prefix, a fuzzy name, an exact formula and a
 * palette-prefixed query, plus two informal worst cases. Builds: the pure document builder (main thread) and the index
 * (worker). Updates: one document into the index, and the main-side sync end to end (changed record, document build, hash,
 * in-process engine) for an ordinary edit and for the rename of the 1,000-referrer hub (documents embed no other record's name,
 * so it costs the same one document). Run once, alone; not `bench:baseline`, not `bench:compare`.
 */
import { bench, describe } from 'vitest';
import { indexEngine } from '@/core/indexes/full';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { buildDocument, documentPortsOf } from '@/search/document';
import { createSearchEngine } from '@/search/engine';
import { parsePalette } from '@/search/palette/parse';
import type { SearchDocument, SearchQuery } from '@/search/contracts';
import { createSearchHandlers } from '@/workers/search/handlers';
import { createSearchSync } from '@/workers/search/sync';
import type { SearchService } from '@/workers/search/service';
import { designTierHubState, FAST_BENCH_OPTIONS, mostReferencedSpecies, SLOW_BENCH_OPTIONS, tierState } from '@/test-support/perf-kit';
import { fullDocuments, withSearchExtras } from '@/test-support/search-state';

/** Formulas on the species, as an author would have entered some. */
function withFormulas(documents: SearchDocument[]): SearchDocument[] {
  return documents.map((doc, i) => (doc.kind === 'species' ? { ...doc, formula: `C${i % 40}H${i % 90}O${i % 7}` } : doc));
}

const state = withSearchExtras(tierState('design', 'dense'));
const documents = withFormulas(fullDocuments(state, 1));
const reactions = documents.filter((doc) => doc.kind === 'reaction').length;
if (reactions < 5_000) throw new Error(`bench: the design tier has ${reactions} reaction documents, not 5,000`);
const engine = createSearchEngine();
engine.load(documents, 1);
const run = (query: SearchQuery) => (): void => {
  if (engine.search(query).length === 0 && query.text !== 'zzzz') throw new Error(`bench: no hit for ${JSON.stringify(query)}`);
};
const palette = parsePalette('r: Reaction 4100');
if (palette.mode !== 'search') throw new Error('bench: the palette query did not parse as a search');
const exam = 'exv_s-2025';
const formula = (documents.find((doc) => doc.formula !== undefined) as SearchDocument).formula as string;

describe('search: queries at the design tier (5,000 reactions), worker code in Node (step 4.5)', () => {
  bench('name prefix: "Reaction 41"', run({ text: 'Reaction 41', limit: 50, examVersionId: exam }), FAST_BENCH_OPTIONS);
  bench('fuzzy name: "Reactin 4100" (one missing letter)', run({ text: 'Reactin 4100', limit: 50, examVersionId: exam }), FAST_BENCH_OPTIONS);
  bench('formula: a species formula, exact ("C0H..O.." form)', run({ text: formula, limit: 50, examVersionId: exam }), FAST_BENCH_OPTIONS);
  bench('palette-prefixed: "r: Reaction 4100"', run({ text: palette.text, limit: 50, examVersionId: exam, ...(palette.mode === 'search' && palette.kinds !== undefined ? { kinds: palette.kinds } : {}) }), FAST_BENCH_OPTIONS);
  bench('worst case, a prefix every reaction matches: "reacti"', run({ text: 'reacti', limit: 50, examVersionId: exam }), FAST_BENCH_OPTIONS);
  bench('worst case, fuzzy over every species: "specias"', run({ text: 'specias', limit: 50, examVersionId: exam }), FAST_BENCH_OPTIONS);
});

describe('search: full builds at the design tier (5,000 reactions), step 4.5', () => {
  bench('every document built from the state (main thread: the pure builder, exam scope per version)', () => {
    const ports = documentPortsOf(state, indexEngine.build(state, 1));
    let made = 0;
    for (const kind of Object.keys(state.records) as (keyof CanonicalState['records'])[]) {
      for (const record of Object.values(state.records[kind] as Record<string, AnyRecord>)) if (buildDocument(record, ports) !== undefined) made += 1;
    }
    if (made < 5_000) throw new Error('bench: too few documents');
  }, SLOW_BENCH_OPTIONS);
  bench('the same, with the indexes already built (the builder and scopeOf alone)', (() => {
    const indexes = indexEngine.build(state, 1);
    return () => {
      const ports = documentPortsOf(state, indexes);
      for (const kind of Object.keys(state.records) as (keyof CanonicalState['records'])[]) {
        for (const record of Object.values(state.records[kind] as Record<string, AnyRecord>)) buildDocument(record, ports);
      }
    };
  })(), SLOW_BENCH_OPTIONS);
  bench('the index built from the documents (worker: load)', () => {
    createSearchEngine().load(documents, 1);
  }, SLOW_BENCH_OPTIONS);
  bench('serialize the index (worker)', () => {
    engine.serialize();
  }, SLOW_BENCH_OPTIONS);
  bench('loadSerialized (worker, warm boot)', (() => {
    const json = engine.serialize();
    return () => {
      if (!createSearchEngine().loadSerialized(json).ok) throw new Error('bench: the serialised index did not load');
    };
  })(), SLOW_BENCH_OPTIONS);
});

/** A sync whose service is an in-process engine, and a way to flip one record between two states. */
function syncOver(base: CanonicalState, target: AnyRecord, edited: AnyRecord) {
  const handlersEngine = createSearchEngine();
  const handlers = createSearchHandlers(handlersEngine);
  const ctx = { signal: new AbortController().signal, progress: () => undefined };
  const service: Pick<SearchService, 'load' | 'apply'> = {
    load: async (docs, revision) => {
      await handlers.load({ documents: docs, revision }, ctx);
      return { ok: true, value: undefined };
    },
    apply: async (update) => ({ ok: true, value: await handlers.apply(update, ctx) }),
  };
  const states = [base, { ...base, records: { ...base.records, [target.kind]: { ...(base.records[target.kind] as Record<string, AnyRecord>), [target.id]: edited } } } as CanonicalState];
  let which = 0;
  let revision = 1;
  const indexes = indexEngine.build(base, 1);
  const sync = createSearchSync({ state: () => states[which] as CanonicalState, indexes: () => indexes, revision: () => revision, service, schedule: () => undefined });
  return {
    sync,
    handlersEngine,
    async boot() {
      sync.reload();
      await sync.flush();
    },
    async edit() {
      const [was, now] = which === 0 ? [target, edited] : [edited, target];
      which = 1 - which;
      revision += 1;
      const path = ['records', target.kind, target.id];
      const changes: ChangeSet = {
        revision,
        label: 'edit',
        cause: 'command',
        created: [],
        updated: [{ kind: target.kind, id: target.id } as never],
        deleted: [],
        patches: [{ op: 'replace', path, value: now }],
        inversePatches: [{ op: 'replace', path, value: was }],
      };
      sync.onChange(changes);
      await sync.flush();
    },
  };
}

const ordinary = Object.values(state.records.species)[3] as AnyRecord;
const renamedOrdinary = { ...ordinary, names: { ...(ordinary as unknown as { names: object }).names, canonical: 'Renamed species' } } as unknown as AnyRecord;
const hubState = withSearchExtras(designTierHubState());
const hubIndexes = indexEngine.build(hubState, 1);
const hubRef = mostReferencedSpecies(hubState, hubIndexes);
const hub = hubState.records.species[hubRef.id as never] as unknown as AnyRecord;
const referrers = hubIndexes.referrersOf(hubRef.id).length;
if (referrers < 1_000) throw new Error(`bench: the hub has ${referrers} referrers, not 1,000`);
const renamedHub = { ...hub, names: { ...(hub as unknown as { names: object }).names, canonical: 'Water (renamed)' } } as unknown as AnyRecord;
const version = state.records.exam_version[exam as never] as unknown as { units: { topicCoverage: { topicId: string; coverage: string }[] }[] };
const reCovered = { ...version, units: version.units.map((unit) => ({ ...unit, topicCoverage: unit.topicCoverage.map((tc) => ({ ...tc, coverage: tc.coverage === 'included' ? 'excluded' : 'included' })) })) } as unknown as AnyRecord;

describe('search: one incremental update, design tier, step 4.5', () => {
  const ordinaryRig = syncOver(state, ordinary, renamedOrdinary);
  const hubRig = syncOver(hubState, hub, renamedHub);
  const curriculumRig = syncOver(state, version as unknown as AnyRecord, reCovered);
  const one = withFormulas(documents.slice(0, 1))[0] as SearchDocument;
  let flip = false;
  bench('the index takes one upserted document (worker: apply, ordinary edit)', () => {
    flip = !flip;
    const revision = engine.revision;
    const answer = engine.apply({ fromRevision: revision, revision: revision + 1, upsert: [flip ? { ...one, title: `${one.title} edited` } : one], remove: [] });
    if (!answer.ok) throw new Error('bench: the update was refused');
  }, FAST_BENCH_OPTIONS);
  bench('sync: an ordinary edit end to end (change, document build, hash, in-process engine)', async () => {
    await ordinaryRig.edit();
  }, { ...FAST_BENCH_OPTIONS, setup: () => ordinaryRig.boot() });
  bench('sync: rename of the 1,000-referrer hub (one document: documents hold no other record\'s name)', async () => {
    await hubRig.edit();
  }, { ...FAST_BENCH_OPTIONS, setup: () => hubRig.boot() });
  bench('sync: a curriculum edit (exam version coverage): every document rebuilt, 500 at a time, only the changed sent', async () => {
    await curriculumRig.edit();
  }, { ...SLOW_BENCH_OPTIONS, setup: () => curriculumRig.boot() });
});
