/**
 * Step 5.1b, the L4 service inside the app services (headless, in-memory hosts, fake RDKit behind the real chem host): L4 follows
 * the store (`onChange` from `store.subscribe`), checks everything after boot and after every replace or reload (import, restore,
 * follower reload, promotion), shows "check unavailable" for timeouts and unavailability and never CHEM-001, tells the search sync
 * about derived formulas, and runs in a follower tab without writing canonical data. ONE test follows one edit through store ->
 * IndexedDB -> replica -> search index -> L4 findings.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/services';
import type { CanonicalState, Species } from '@/core/schema';
import { createBooter, demoState, editNote } from '@/test-support/app-boot-kit';
import { engineKit, fakeMoleculesFor, type EngineKit } from '@/test-support/app-engines-kit';
import type { FakeMolSpec } from '@/test-support/fake-rdkit';
import { testEnv, worldHolding, type TestEnv } from '@/test-support/app-env-kit';
import { envelope, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import { freshDb } from '@/test-support/persistence-kit';
import { documentsOf } from '@/test-support/search-rig';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const BAD = 'C(C(';
const replaceSpecies = (state: CanonicalState, id: string, patch: Partial<Species>): CanonicalState => ({
  ...state,
  records: { ...state.records, species: { ...state.records.species, [id]: { ...(state.records.species[id] as Species), ...patch } } },
});
const speciesIds = (state: CanonicalState): string[] => Object.keys(state.records.species).sort();

/** The demo with its first species given a structure RDKit (the fake) cannot read, so CHEM-001 is expected for it. */
function stateWithBadSpecies(): { state: CanonicalState; bad: string } {
  const demo = demoState();
  const bad = speciesIds(demo)[0] as string;
  return { state: replaceSpecies(demo, bad, { structure: { format: 'smiles', value: BAD } }), bad };
}
const kitFor = (state: CanonicalState): EngineKit => {
  // the fake RDKit cannot read BAD: CHEM-001
  const molecules: Record<string, FakeMolSpec | null> = Object.fromEntries(Object.entries(fakeMoleculesFor(state)).filter(([value]) => value !== BAD));
  return engineKit({ molecules });
};

async function boot(state: CanonicalState, kit: EngineKit, world?: Awaited<ReturnType<typeof worldHolding>>) {
  const t = testEnv({ world: world ?? (await worldHolding(state, 2)), workers: kit.factories });
  const services = await booter.bootEnv(t);
  return { services, t, world: t.world };
}
/** Fires the L4 debounce and waits until the run is done. */
async function runL4(services: AppServices, t: TestEnv): Promise<void> {
  await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(400));
  t.scheduler.fireAfter(400);
  await services.l4.flush();
}
const chemChecks = (rule: string, services: AppServices) => services.store.findings.all({ level: 4 }).filter((f) => f.ruleId === rule);

describe('the L4 service follows the store', () => {
  it('checks everything after boot: CHEM-001 for the unreadable structure, a status per subject, the summary in AppStatus', async () => {
    const { state, bad } = stateWithBadSpecies();
    const kit = kitFor(state);
    const { services, t } = await boot(state, kit);
    expect(services.status.get().l4).toMatchObject({ state: 'checking', queued: expect.any(Number) });
    expect(services.status.get().l4.queued).toBeGreaterThan(50);
    expect(services.l4.statusOf({ kind: 'species', id: bad })).toEqual({ state: 'pending' });
    await runL4(services, t);
    expect(chemChecks('CHEM-001', services).map((f) => f.subject.id)).toEqual([bad]);
    expect(services.l4.statusOf({ kind: 'species', id: bad })).toEqual({ state: 'checked', notCompared: [] });
    expect(services.status.get().l4).toEqual({ state: 'idle', notChecked: 0, queued: 0, message: null });
  });

  it('one edit is checked incrementally: only the edited species goes to the worker', async () => {
    const state = demoState();
    const { services, t } = await boot(state, kitFor(state));
    await runL4(services, t);
    const kit = (services as unknown as { __kit?: EngineKit }).__kit;
    void kit;
    const before = services.l4.stats().items.checkSpecies;
    const id = speciesIds(services.store.getState())[3] as string;
    mustCommit(services.store.dispatch(envelope('Break one', { type: 'record.update', record: withFields(recordIn(services.store.getState(), 'species', id), { structure: { format: 'smiles', value: BAD } }) })));
    expect(services.l4.statusOf({ kind: 'species', id })).toEqual({ state: 'pending' });
    await runL4(services, t);
    expect(services.l4.stats().items.checkSpecies - before).toBe(1);
    expect(chemChecks('CHEM-001', services).map((f) => f.subject.id)).toEqual([id]);
  });

  it('a replace (import, restore) checks everything again', async () => {
    const state = demoState();
    const { services, t } = await boot(state, kitFor(state));
    await runL4(services, t);
    expect(services.status.get().l4.queued).toBe(0);
    const { state: other, bad } = stateWithBadSpecies();
    mustCommit(services.store.replaceState(other, 'import'));
    expect(services.status.get().l4.queued).toBeGreaterThan(50);
    await runL4(services, t);
    expect(chemChecks('CHEM-001', services).map((f) => f.subject.id)).toEqual([bad]);
  });
});

describe('the engine could not answer: "check unavailable", never CHEM-001', () => {
  it('a toolkit that cannot load', async () => {
    const { state } = stateWithBadSpecies();
    const kit = kitFor(state);
    kit.chem.loadFailure = new Error('blocked');
    const { services, t } = await boot(state, kit);
    await runL4(services, t);
    expect(services.status.get().l4).toMatchObject({ state: 'unavailable', message: expect.stringContaining('check unavailable') });
    expect(chemChecks('CHEM-001', services)).toEqual([]);
    expect(services.store.findings.all({ level: 4 })).toEqual([]);
  });

  it('a toolkit that hangs: the call times out, the worker is restarted, the records are "not checked", still no CHEM-001', async () => {
    const { state } = stateWithBadSpecies();
    const kit = kitFor(state);
    const { services, t } = await boot(state, kit);
    // the toolkit hangs on ONE structure: its batch times out (2 s), is sent item by item, and that one item times out alone
    kit.chem.hangWhen = (method, params) => method === 'checkSpecies' && JSON.stringify(params).includes(BAD);
    await runL4(services, t);
    const status = services.status.get().l4;
    expect(status.notChecked).toBe(1);
    expect(status.message).toContain('check unavailable for 1 record:');
    expect(chemChecks('CHEM-001', services)).toEqual([]);
    expect(kit.chem.workers.length).toBeGreaterThanOrEqual(2); // each timeout restarted the worker
    expect(services.status.get().workers.chem.state).toBe('ok');
  }, 30_000);
});

describe('checkAll after a reload', () => {
  it('a follower promoted to writer checks everything again; a follower runs L4 without writing canonical data', async () => {
    const { state, bad } = stateWithBadSpecies();
    const world = await worldHolding(state, 2);
    const a = await boot(state, kitFor(state), world);
    const kitB = kitFor(state);
    const b = await boot(state, kitB, world);
    expect(b.services.status.get().mode).toBe('follower');
    const tdb = freshDb(undefined, world.indexedDB);
    const rowsBefore = await tdb.db.records.count();
    const revisionBefore = (await tdb.db.meta.get('revision'))?.value;
    await runL4(b.services, b.t);
    expect(chemChecks('CHEM-001', b.services).map((f) => f.subject.id)).toEqual([bad]); // the follower's own findings
    expect(b.services.store.isReadOnly()).toBe(true);
    expect(await tdb.db.records.count()).toBe(rowsBefore); // nothing canonical written by the follower
    expect((await tdb.db.meta.get('revision'))?.value).toBe(revisionBefore);
    expect(b.t.scheduler.liveDelays()).not.toContain(5_000); // and no search cache either

    await a.services.dispose();
    await vi.waitFor(() => expect(b.services.status.get().promotion).toBe('promoted'));
    expect(b.services.status.get().l4.queued).toBeGreaterThan(50); // the promotion's reload queued everything
    await runL4(b.services, b.t);
    expect(b.services.status.get().l4.queued).toBe(0);
    tdb.db.close();
  });
});

describe('derived formulas reach the search documents', () => {
  it('a species with a structure and no entered formula gets its derived formula in its search document, and is found by it', async () => {
    const state = demoState();
    const plain = Object.values(state.records.species).find((s) => s.structure !== undefined && s.formula === undefined);
    expect(plain).toBeDefined();
    const kit = kitFor(state);
    const { services, t } = await boot(state, kit);
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    const before = documentsOf(kit.search.engines[0] as never).find((d) => d.id === plain?.id);
    expect(before?.derivedFormula).toBeUndefined(); // L4 has not read the structure yet
    await runL4(services, t);
    expect(services.l4.derivedFormulaOf({ kind: 'species', id: plain?.id as string })).toBe('C2H6O');
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200)); // refresh(ids) queued their documents
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    const after = documentsOf(kit.search.engines[0] as never).find((d) => d.id === plain?.id);
    expect(after).toMatchObject({ derivedFormula: 'C2H6O' });
    const hits = await services.search.search('palette', { text: 'C₂H₆O', limit: 200 });
    expect(hits.ok && hits.value.some((hit) => hit.ref.id === plain?.id && hit.matchedField === 'formula')).toBe(true);
  });
});

describe('one edit through the whole chain', () => {
  it('store -> IndexedDB -> replica -> search index -> L4 findings', async () => {
    const state = demoState();
    const kit = kitFor(state);
    const { services, t, world } = await boot(state, kit);
    await runL4(services, t);
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    const id = speciesIds(services.store.getState())[5] as string;
    mustCommit(
      services.store.dispatch(
        envelope('Rename and break', {
          type: 'record.update',
          record: withFields(recordIn(services.store.getState(), 'species', id), { names: { canonical: 'Zzyzxol', common: [], aliases: [] }, structure: { format: 'smiles', value: BAD } }),
        }),
      ),
    );
    const revision = services.store.getRevision();
    // 1. IndexedDB
    await services.persistence?.flush();
    const tdb = freshDb(undefined, world.indexedDB);
    expect((await tdb.db.meta.get('revision'))?.value).toBe(revision);
    expect((await tdb.db.records.get(id) as Species | undefined)?.names.canonical).toBe('Zzyzxol');
    tdb.db.close();
    // 2. the replica (the compute worker's copy of the store)
    expect((await services.replicaSync()?.settled())?.replicaRevision).toBe(revision);
    // 3. the search index
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    expect(services.searchSync()?.status()).toMatchObject({ state: 'idle', indexRevision: revision });
    const found = await services.search.search('palette', { text: 'Zzyzxol', limit: 5 });
    expect(found.ok && found.value[0]?.ref.id).toBe(id);
    // 4. the L4 findings
    await runL4(services, t);
    expect(chemChecks('CHEM-001', services).map((f) => f.subject.id)).toEqual([id]);
    editNote(services, 'unrelated'); // the chain keeps going
    expect(services.store.getRevision()).toBe(revision + 1);
  });
});
