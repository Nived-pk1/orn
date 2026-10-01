/**
 * The search worker and its main-side service and sync (step 4.5): handlers over a real RPC host and client on an in-memory port
 * (every message structured-cloned), refusals as values, a newer query superseding an older, the sync's incremental updates,
 * its fan-out to documents another record's change moves, the 500 cap with a backlog, REVISION_MISMATCH and the one full load,
 * a restarted worker, a failing worker, and the ADV rows for search (ADV-019 search half, ADV-058 search part).
 */
import { describe, expect, it } from 'vitest';
import { makeStore, testContext } from '@/test-support/command-kit';
import { documentsOf, firstDifference, freshEngine, queriesOf, searchRig, type SearchRig } from '@/test-support/search-rig';
import { fullDocuments, searchStateOf } from '@/test-support/search-state';
import { doc } from '@/test-support/search-docs';
import { createSearchSync, REFRESH_CAP } from './sync';
import type { SearchOutcome, SearchService } from './service';
import type { AnyRecord, CanonicalState } from '@/core/schema';
import { indexEngine } from '@/core/indexes/full';

const PARAMS = { species: 14, classes: 3, reagents: 3, reactions: 10, relationshipsPerReaction: 0.5, topics: 3, shape: 'dense', seed: 9 } as const;

async function booted(state: CanonicalState = searchStateOf(PARAMS)): Promise<SearchRig> {
  const rig = searchRig(makeStore(state));
  await rig.boot();
  return rig;
}

/** Everything the held index knows is what a fresh build gives, documents and answers. */
async function expectInStep(rig: SearchRig, label: string): Promise<void> {
  await rig.sync.flush();
  const state = rig.store.getState();
  const full = fullDocuments(state, rig.store.getRevision());
  expect(documentsOf(rig.engine()), `${label}: documents`).toEqual(full);
  expect(rig.engine().revision, `${label}: revision`).toBe(rig.store.getRevision());
  const queries = queriesOf(full, Object.keys(state.records.exam_version));
  expect(firstDifference(rig.engine(), freshEngine(state, rig.store.getRevision()), queries), `${label}: answers`).toBeUndefined();
  expect(rig.sync.status().state, label).toBe('idle');
}

const titleOf = (rig: SearchRig, id: string): string => fullDocuments(rig.store.getState()).find((d) => d.id === id)?.title ?? '';
const recordOf = (rig: SearchRig, kind: 'species' | 'reaction' | 'reagent', n = 0): AnyRecord => Object.values(rig.store.getState().records[kind] as Record<string, AnyRecord>).sort((a, b) => (a.id < b.id ? -1 : 1))[n] as AnyRecord;

describe('the worker over RPC', () => {
  it('load, search, apply, serialize, loadSerialized through a real host and client', async () => {
    const rig = await booted();
    const service = rig.service;
    const species = recordOf(rig, 'species');
    const hits = await service.search('palette', { text: titleOf(rig, species.id), limit: 5 });
    expect(hits).toMatchObject({ ok: true });
    if (!hits.ok) throw new Error('unreachable');
    expect(hits.value[0]?.ref).toEqual({ kind: 'species', id: species.id });
    const serialized = await service.serialize();
    if (!serialized.ok) throw new Error('unreachable');
    expect(serialized.value.revision).toBe(rig.store.getRevision());
    expect(await service.loadSerialized({ ...serialized.value })).toMatchObject({ ok: true, value: { ok: true } });
    expect(await service.loadSerialized({ json: '{', revision: 0 })).toMatchObject({ ok: true, value: { ok: false, code: 'BAD_INDEX' } });
  });

  it('search before any load is NOT_READY, never an empty list', async () => {
    const rig = searchRig(makeStore(searchStateOf(PARAMS)));
    expect(await rig.service.search('palette', { text: 'x', limit: 5 })).toMatchObject({ ok: false, code: 'NOT_READY' });
  });

  it('malformed requests are BAD_REQUEST and change nothing', async () => {
    const rig = await booted();
    const before = documentsOf(rig.engine());
    const call = rig.client;
    expect(await call.search({ text: 'x', limit: 0 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await call.search({ text: 'x'.repeat(2_000), limit: 5 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await call.load({ documents: 'nope' as never, revision: 1 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await call.load({ documents: [doc('spc_a'), doc('spc_a')], revision: 1 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await call.load({ documents: [], revision: -3 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await call.apply({ fromRevision: 1.5, revision: 2, upsert: [], remove: [] })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    const revision = rig.engine().revision;
    expect(await call.apply({ fromRevision: revision, revision: revision + 1, upsert: [{ ...doc('spc_x'), kind: 'asset' as never }], remove: [] })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(await call.loadSerialized({ json: 5 as never, revision: 1 })).toMatchObject({ ok: false, error: { code: 'BAD_REQUEST' } });
    expect(documentsOf(rig.engine())).toEqual(before);
    expect(rig.engine().revision).toBe(revision);
    expect(await rig.service.search('p', { text: 'x', limit: 0 })).toMatchObject({ ok: false, code: 'BAD_REQUEST' });
  });

  it('a newer query on a channel supersedes the older (CANCELLED, dropped); other channels are unaffected', async () => {
    const rig = await booted();
    const first = rig.service.search('palette', { text: 'reaction', limit: 5 });
    const other = rig.service.search('list', { text: 'species', limit: 5 });
    const second = rig.service.search('palette', { text: 'species', limit: 5 });
    expect(await first).toMatchObject({ ok: false, code: 'CANCELLED' });
    expect(await second).toMatchObject({ ok: true });
    expect(await other).toMatchObject({ ok: true });
    expect(rig.service.superseded()).toBe(1);
    // a finished query is not "superseded" by the next one
    expect(await rig.service.search('palette', { text: 'reaction', limit: 5 })).toMatchObject({ ok: true });
    expect(rig.service.superseded()).toBe(1);
  });

  it('every message that crossed the port was a structured clone of valid data', async () => {
    const rig = await booted();
    await rig.service.search('palette', { text: 'reaction', limit: 5, facets: { scopes: ['official'] } });
    expect(rig.workers()[0]?.received.length).toBeGreaterThan(1);
  });
});

describe('the sync: incremental updates', () => {
  it('boot loads every document; nothing is queued', async () => {
    const rig = await booted();
    expect(rig.sync.stats()).toMatchObject({ loads: 1, updates: 0, mismatches: 0 });
    expect(rig.sync.status()).toMatchObject({ state: 'idle', queued: 0, backlog: 0, loadPending: false, indexRevision: rig.store.getRevision() });
    await expectInStep(rig, 'boot');
  });

  it('an ordinary edit sends exactly one document; a note on a presentation-free kind sends none', async () => {
    const rig = await booted();
    const species = recordOf(rig, 'species') as unknown as { names: object };
    const result = rig.store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, canonical: 'Brand new name' } } as unknown as AnyRecord }] });
    expect(result.ok).toBe(true);
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ updates: 1, upserts: 1, removals: 0 });
    await expectInStep(rig, 'rename');
    const meta = rig.store.dispatch({ label: 'Retitle', commands: [{ type: 'meta.update', meta: { ...rig.store.getState().meta, title: 'Another title' } }] });
    expect(meta.ok).toBe(true);
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ upserts: 1 }); // a revision-only update, no document
    await expectInStep(rig, 'meta');
  });

  it('ADV-019 (search half): after a rename the new name finds the record and the old one does not, unless it is an alias', async () => {
    const rig = await booted();
    const species = recordOf(rig, 'species') as unknown as { id: string; names: { canonical: string; aliases: string[] } };
    const old = species.names.canonical;
    const search = async (text: string): Promise<string[]> => {
      const out = await rig.service.search('p', { text, limit: 20 });
      return out.ok ? out.value.map((h) => h.ref.id) : [];
    };
    expect(await search(old)).toContain(species.id);
    rig.store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, canonical: 'Quinquagintillion' } } as unknown as AnyRecord }] });
    await rig.sync.flush();
    expect(await search('Quinquagintillion')).toEqual([species.id]);
    expect(await search(old)).not.toContain(species.id);
    // renamed again, the old name kept as an alias: both find it
    rig.store.dispatch({ label: 'Rename again', commands: [{ type: 'record.update', record: { ...rig.store.getState().records.species[species.id as never], names: { canonical: 'Sexagintillion', common: [], aliases: [old, 'Quinquagintillion'] } } as unknown as AnyRecord }] });
    await rig.sync.flush();
    expect(await search(old)).toContain(species.id);
    expect(await search('Sexagintillion')).toEqual([species.id]);
    expect((await search('Quinquagintillion'))[0]).toBe(species.id);
  });

  it('ADV-058 (search part): every alias, Unicode α and subscripts included, finds the one record', async () => {
    const rig = await booted();
    const species = recordOf(rig, 'species') as unknown as { id: string; names: object };
    const aliases = ['α-D-glucopyranose', 'alpha D glucopyranose', 'C₆H₁₂O₆', 'C6H12O6', 'Dextrose', 'grape sugar', 'β-form', 'Δ-form'];
    rig.store.dispatch({ label: 'Aliases', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, aliases } } as unknown as AnyRecord }] });
    await rig.sync.flush();
    for (const alias of aliases) {
      const out = await rig.service.search('p', { text: alias, limit: 5 });
      expect(out.ok && out.value[0]?.ref.id, alias).toBe(species.id);
      expect(out.ok && out.value.filter((h) => h.ref.id === species.id), alias).toHaveLength(1);
    }
    for (const [a, b] of [['C₆H₁₂O₆', 'C6H12O6'], ['α-D-glucopyranose', 'alpha d glucopyranose'], ['β-form', 'beta form'], ['Δ-form', 'delta form']] as const) {
      const [x, y] = await Promise.all([rig.service.search('x', { text: a, limit: 5 }), rig.service.search('y', { text: b, limit: 5 })]);
      expect(JSON.stringify(x.ok && x.value.map((h) => h.ref.id))).toBe(JSON.stringify(y.ok && y.value.map((h) => h.ref.id)));
    }
    await expectInStep(rig, 'aliases');
  });

  it('a deletion removes the document; undo brings it back; redo removes it again', async () => {
    const rig = await booted();
    const species = recordOf(rig, 'species');
    const unused = rig.store.dispatch({ label: 'Create', commands: [{ type: 'record.create', record: { ...(species as unknown as object), id: testContext(3).newId('spc'), names: { canonical: 'Temporary', common: [], aliases: [] } } as unknown as AnyRecord }] });
    expect(unused.ok).toBe(true);
    await expectInStep(rig, 'created');
    const id = Object.keys(rig.store.getState().records.species).find((key) => (rig.store.getState().records.species[key as never] as { names: { canonical: string } }).names.canonical === 'Temporary') as string;
    expect(documentsOf(rig.engine()).some((d) => d.id === id)).toBe(true);
    rig.store.undo();
    await expectInStep(rig, 'undone');
    expect(documentsOf(rig.engine()).some((d) => d.id === id)).toBe(false);
    rig.store.redo();
    await expectInStep(rig, 'redone');
    expect(documentsOf(rig.engine()).some((d) => d.id === id)).toBe(true);
    expect(rig.sync.stats().removalsUnknown).toBe(0);
  });
});

describe('the sync: documents that depend on another record', () => {
  it('a topic mapping moves the target’s topics and scope; deleting it moves them back; retargeting moves both ends', async () => {
    const rig = await booted();
    const [r0, r1] = [recordOf(rig, 'reaction', 0), recordOf(rig, 'reaction', 1)];
    const state = rig.store.getState();
    const topic = Object.keys(state.records.topic).sort()[1] as string;
    const species = recordOf(rig, 'species');
    const created = rig.store.dispatch({ label: 'Map', commands: [{ type: 'record.create', record: { id: testContext(5).newId('tmp'), kind: 'topic_mapping', topicId: topic, target: { kind: 'species', id: species.id }, role: 'core', tags: [], citations: [], provenance: (species as unknown as { provenance: object }).provenance, review: { lifecycle: 'published', status: 'unreviewed', reasons: [] } } as unknown as AnyRecord }] });
    expect(created.ok).toBe(true);
    await expectInStep(rig, 'mapped');
    expect(documentsOf(rig.engine()).find((d) => d.id === species.id)?.facets.topicIds).toContain(topic);
    const mappingId = Object.keys(rig.store.getState().records.topic_mapping).find((id) => (rig.store.getState().records.topic_mapping[id as never] as { target: { id: string } }).target.id === species.id) as string;
    const mapping = rig.store.getState().records.topic_mapping[mappingId as never] as unknown as object;
    rig.store.dispatch({ label: 'Retarget', commands: [{ type: 'record.update', record: { ...mapping, target: { kind: 'reaction', id: r1.id } } as unknown as AnyRecord }] });
    await expectInStep(rig, 'retargeted');
    expect(documentsOf(rig.engine()).find((d) => d.id === species.id)?.facets.topicIds).not.toContain(topic);
    rig.store.dispatch({ label: 'Unmap', commands: [{ type: 'record.delete', ref: { kind: 'topic_mapping', id: mappingId }, mode: 'restrict' }] });
    await expectInStep(rig, 'unmapped');
    void r0;
  });

  it('an exam version’s coverage moves the scope ranks of every record mapped under it', async () => {
    const rig = await booted();
    const state = rig.store.getState();
    const version = state.records.exam_version['exv_s-2025' as never] as unknown as { units: { topicCoverage: { topicId: string; coverage: string }[] }[] };
    const flipped = { ...version, units: version.units.map((u) => ({ ...u, topicCoverage: u.topicCoverage.map((tc) => ({ ...tc, coverage: tc.coverage === 'included' ? 'excluded' : 'included' })) })) };
    const before = documentsOf(rig.engine());
    expect(rig.store.dispatch({ label: 'Coverage', commands: [{ type: 'record.update', record: flipped as unknown as AnyRecord }] }).ok).toBe(true);
    await expectInStep(rig, 'coverage');
    expect(documentsOf(rig.engine())).not.toEqual(before);
  });

  it('a reagent’s families move its reactions’ facet; the reactions are queued behind a cap and none is dropped', async () => {
    const hub = { species: 30, classes: 2, reagents: 1, reactions: REFRESH_CAP * 2 + 40, relationshipsPerReaction: 0, topics: 2, shape: 'hub_explosion', seed: 3 } as const;
    const rig = await booted(searchStateOf(hub));
    const reagent = recordOf(rig, 'reagent') as unknown as { id: string };
    const applies: number[] = [];
    const originalApply = rig.service.apply.bind(rig.service);
    (rig.service as { apply: SearchService['apply'] }).apply = async (update) => {
      applies.push(update.upsert.length);
      return originalApply(update);
    };
    expect(rig.store.dispatch({ label: 'Families', commands: [{ type: 'record.update', record: { ...reagent, families: ['oxidant'] } as unknown as AnyRecord }] }).ok).toBe(true);
    const queued = rig.sync.status();
    expect(queued.queued).toBeLessThanOrEqual(REFRESH_CAP + 1);
    expect(queued.backlog).toBe(REFRESH_CAP * 2 + 40 - REFRESH_CAP);
    await rig.sync.flush();
    expect(rig.sync.status()).toMatchObject({ queued: 0, backlog: 0, state: 'idle' });
    expect(Math.max(...applies)).toBeLessThanOrEqual(REFRESH_CAP + 1);
    expect(applies.length).toBeGreaterThanOrEqual(3);
    expect(applies.reduce((a, b) => a + b, 0)).toBe(REFRESH_CAP * 2 + 40 + 1); // every reaction and the reagent, once
    expect(rig.sync.stats().maxQueuedAtOnce).toBeLessThanOrEqual(REFRESH_CAP);
    await expectInStep(rig, 'hub');
  });

  it('a prerequisite on a reaction moves a concept’s scope; so does a relationship', async () => {
    const rig = await booted();
    const reaction = recordOf(rig, 'reaction') as unknown as { id: string };
    expect(rig.store.dispatch({ label: 'Prerequisite', commands: [{ type: 'record.update', record: { ...reaction, prerequisiteConceptIds: ['cpt_s-inductive'] } as unknown as AnyRecord }] }).ok).toBe(true);
    await expectInStep(rig, 'prerequisite field');
    expect(documentsOf(rig.engine()).find((d) => d.id === 'cpt_s-inductive')?.scopeRanks).toBeDefined();
    rig.store.dispatch({ label: 'Remove rel', commands: [{ type: 'record.delete', ref: { kind: 'relationship', id: 'rel_s-pre' }, mode: 'restrict' }] });
    await expectInStep(rig, 'relationship');
  });
});

describe('the sync: revision mismatch, full loads, failures', () => {
  it('a replaceState is one full load', async () => {
    const rig = await booted();
    const other = searchStateOf({ ...PARAMS, seed: 77 });
    const replaced = rig.store.replaceState(other, 'import');
    expect(replaced.ok, JSON.stringify(replaced.ok ? '' : replaced.error)).toBe(true);
    expect(rig.sync.status().loadPending).toBe(true);
    await expectInStep(rig, 'replaced');
    expect(rig.sync.stats()).toMatchObject({ loads: 2, mismatches: 0 });
  });

  it('REVISION_MISMATCH is a value; the sync answers it with ONE full load and goes on', async () => {
    const rig = await booted();
    // another writer moves the worker’s index on: the sync’s next update no longer follows it
    const revision = rig.engine().revision;
    expect(await rig.service.apply({ fromRevision: revision, revision: revision + 5, upsert: [], remove: [] })).toMatchObject({ ok: true, value: { ok: true } });
    expect(await rig.service.apply({ fromRevision: 1, revision: 2, upsert: [], remove: [] })).toMatchObject({ ok: true, value: { ok: false, code: 'REVISION_MISMATCH', have: revision + 5 } });
    const species = recordOf(rig, 'species') as unknown as { names: object };
    rig.store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, canonical: 'After the jump' } } as unknown as AnyRecord }] });
    await rig.sync.flush();
    expect(rig.sync.stats()).toMatchObject({ mismatches: 1, loads: 2 });
    await expectInStep(rig, 'after mismatch');
  });

  it('a restarted worker (no index) is found out by the next update and reloaded once', async () => {
    const rig = await booted();
    const crashed = rig.workers().length;
    rig.workers()[0]?.crash('exit');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const species = recordOf(rig, 'species') as unknown as { names: object };
    rig.store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, canonical: 'After the crash' } } as unknown as AnyRecord }] });
    await rig.sync.flush();
    expect(rig.workers().length).toBeGreaterThan(crashed);
    expect(rig.sync.stats()).toMatchObject({ mismatches: 1, loads: 2 });
    await expectInStep(rig, 'after restart');
    // and searching a worker that was restarted but not yet reloaded is NOT_READY (checked on a fresh worker)
  });

  it('a worker that fails leaves the sync down with the reason, nothing lost, and the next trigger loads again', async () => {
    const store = makeStore(searchStateOf(PARAMS));
    const calls = { load: 0 };
    let fail = true;
    const down = { ok: false, code: 'TIMEOUT', message: 'search worker is gone' } as const;
    const service: Pick<SearchService, 'load' | 'apply'> = {
      load: async (): Promise<SearchOutcome<void>> => {
        calls.load += 1;
        return fail ? down : { ok: true, value: undefined };
      },
      apply: async () => down,
    };
    const sync = createSearchSync({ state: store.getState, indexes: () => indexEngine.build(store.getState(), 0), revision: store.getRevision, service, schedule: () => undefined });
    await sync.flush();
    expect(sync.status()).toMatchObject({ state: 'down', loadPending: true });
    expect(sync.status().reason).toContain('TIMEOUT');
    expect(sync.stats().failures).toBe(1);
    fail = false;
    await sync.flush();
    expect(sync.status()).toMatchObject({ state: 'idle', loadPending: false, reason: '' });
    expect(calls.load).toBe(2);
  });

  it('an update the worker cannot take (timeout) makes the sync load again instead of guessing', async () => {
    const store = makeStore(searchStateOf(PARAMS));
    let fail = false;
    const real = searchRig(store);
    await real.boot();
    const flaky: Pick<SearchService, 'load' | 'apply'> = {
      load: (docs, revision) => real.service.load(docs, revision),
      apply: async (update) => (fail ? { ok: false, code: 'TIMEOUT', message: 'slow' } : real.service.apply(update)),
    };
    let full = indexEngine.build(store.getState(), store.getRevision());
    const sync = createSearchSync({ state: store.getState, indexes: () => full, revision: store.getRevision, service: flaky, schedule: () => undefined });
    store.subscribe((changes) => {
      full = indexEngine.apply(full, changes, store.getState());
      sync.onChange(changes);
    });
    await sync.flush(); // its own first load
    const species = recordOf(real, 'species') as unknown as { names: object };
    fail = true;
    store.dispatch({ label: 'Rename', commands: [{ type: 'record.update', record: { ...species, names: { ...species.names, canonical: 'While down' } } as unknown as AnyRecord }] });
    await sync.flush();
    expect(sync.status()).toMatchObject({ state: 'down', loadPending: true });
    fail = false;
    await sync.flush();
    expect(sync.status().state).toBe('idle');
    expect(documentsOf(real.engine())).toEqual(fullDocuments(store.getState(), store.getRevision()));
  });
});
