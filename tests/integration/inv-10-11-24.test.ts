/**
 * The three invariants that no Phase 4/5 test named (Gate E packet §9, step 5.11a), each as a test with its number in the title:
 *  INV-10 UI state is never written into a record (a session of UI changes leaves every canonical record deep-equal);
 *  INV-11 derived data is never stored in a record (after a layout, depictions and a search load, no record holds one);
 *  INV-24 validation never modifies data (validateAll and validateTouched in the compute replica, frozen state included).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/services';
import { SEARCH_CACHE_KEY } from '@/app/services/search-part';
import { createPanelsPort, createUiEntryPort } from '@/app/window/panels-port';
import { createValidator, type Validator } from '@/core/validation';
import type { CanonicalState, ExamId, ExamVersionId } from '@/core/schema';
import { createNavigatorUi, createPanelsStore, NAVIGATOR_UI_KEY } from '@/ui/state';
import { SAVE_DEBOUNCE_MS } from '@/ui/state/panels';
import { createBooter, demoState } from '@/test-support/app-boot-kit';
import { engineKit, fakeMoleculesFor } from '@/test-support/app-engines-kit';
import { testEnv, worldHolding, type TestEnv, type World } from '@/test-support/app-env-kit';
import { footprint } from '@/test-support/app-flow-kit';
import { envelope, makeStore, mustCommit, recordIn, ref, withFields } from '@/test-support/command-kit';
import { request } from '@/test-support/layout-kit';
import { freshDb } from '@/test-support/persistence-kit';
import { followingReplica, loadedReplica } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';

const booter = createBooter();
afterEach(() => booter.disposeAll());

const state = demoState();

async function bootDemo(): Promise<{ services: AppServices; world: World; t: TestEnv }> {
  const world = await worldHolding(state, 2);
  const kit = engineKit({ molecules: fakeMoleculesFor(state) });
  const t = testEnv({ world, workers: kit.factories });
  const services = await booter.bootEnv(t);
  return { services, world, t };
}

async function storedRows(world: World): Promise<{ records: string; uiState: number; derived: number }> {
  const tdb = freshDb(undefined, world.indexedDB);
  try {
    const records = (await tdb.db.records.toArray()).sort((a, b) => a.id.localeCompare(b.id));
    return { records: JSON.stringify(records), uiState: await tdb.db.uiState.count(), derived: await tdb.db.derivedCache.count() };
  } finally {
    tdb.db.close();
  }
}

/** Every key name at any depth. */
function keysOf(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) for (const item of value) keysOf(item, into);
  else if (value !== null && typeof value === 'object') {
    for (const [key, inner] of Object.entries(value)) {
      into.add(key);
      keysOf(inner, into);
    }
  }
  return into;
}

describe('INV-10 UI state is never written into a record', () => {
  it('a session that changes panels, filters, the viewport and the exam scope leaves every canonical record deep-equal, in memory and stored', async () => {
    const { services, world, t } = await bootDemo();
    const before = await footprint(services, world);
    const stored = await storedRows(world);
    const examVersion = Object.values(state.records.exam_version)[0];
    if (examVersion === undefined) throw new Error('the demo has no exam version');

    const panels = createPanelsStore(createPanelsPort(services), t.scheduler);
    const ui = createNavigatorUi(createUiEntryPort(services, NAVIGATOR_UI_KEY), t.scheduler);
    panels.getState().setInspectorOpen(false);
    panels.getState().setInspectorWidth(480);
    ui.stores.filters.getState().setFilters({ scopes: [], topicIds: [], reagentFamilies: [] });
    ui.stores.viewports.getState().setViewport('navigator', { x: 12, y: -30, scale: 0.5 });
    ui.stores.exam.getState().setActive({ examId: examVersion.examId as ExamId, examVersionId: examVersion.id as ExamVersionId });
    ui.stores.overview.getState().setMode('list');
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(SAVE_DEBOUNCE_MS));
    t.scheduler.fireAfter(SAVE_DEBOUNCE_MS);
    await ui.flush();
    await services.persistence?.flush();

    const after = await footprint(services, world);
    expect(after.state.records).toEqual(before.state.records);
    expect(after.revision).toBe(before.revision);
    expect(after.history).toEqual(before.history);
    expect(after.stored).toEqual(before.stored);
    const rows = await storedRows(world);
    expect(rows.records).toBe(stored.records);
    // the UI state was really saved, in its own store
    expect(rows.uiState).toBeGreaterThan(stored.uiState);
  });
});

describe('INV-11 derived data is never stored in a record', () => {
  const DERIVED_KEYS = ['layout', 'layouts', 'svg', 'depiction', 'depictions', 'depictionKey', 'searchIndex', 'indexes', 'projection', 'positions'];
  const derivedKeysIn = (value: unknown): string[] => [...keysOf(value)].filter((key) => DERIVED_KEYS.includes(key));

  it('after a layout, depictions and a search load, no record holds a layout, depiction or index field; the derived data went to derivedCache', async () => {
    const { services, world, t } = await bootDemo();
    const before = await storedRows(world);
    const recordsBefore = services.store.getState().records;
    // the check can see such a field: a record that carries one is found
    expect(derivedKeysIn({ id: 'x', layout: {} })).toEqual(['layout']);

    expect(await services.layout.layout('v', request({ nodes: ['a', 'b', 'c'], edges: [['a', 'b'], ['b', 'c']] }))).toMatchObject({ ok: true });
    await vi.waitFor(() => expect(services.status.get().layoutCache.state).toBe('saved'));
    expect(await services.depictions.depict({ format: 'smiles', value: 'CCO' }, { width: 200, height: 150, showAtomMaps: false })).toBeDefined();
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(200));
    t.scheduler.fireAfter(200);
    await services.searchSync()?.flush();
    await vi.waitFor(() => expect(t.scheduler.liveDelays()).toContain(5_000));
    t.scheduler.fireAfter(5_000);
    await vi.waitFor(() => expect(services.status.get().search.cache.state).not.toBe('none'));
    await services.persistence?.flush();

    // in memory and stored: no record has such a field, and the records are the ones from before
    expect(derivedKeysIn(services.store.getState().records)).toEqual([]);
    expect(services.store.getState().records).toEqual(recordsBefore);
    const after = await storedRows(world);
    expect(derivedKeysIn(JSON.parse(after.records))).toEqual([]);
    expect(after.records).toBe(before.records);
    // the derived data exists, in the derived cache
    expect(after.derived).toBeGreaterThan(before.derived);
    const tdb = freshDb(undefined, world.indexedDB);
    try {
      expect(await tdb.db.derivedCache.get(SEARCH_CACHE_KEY)).toBeDefined();
    } finally {
      tdb.db.close();
    }
  });
});

describe('INV-24 validation never modifies data', () => {
  const MAX: CanonicalState = loadFixtureState('maximal-valid');
  const SPECIES = ref('species', 'spc_max-propanone');

  /** A validator whose every call compares the state it was given before and after, and asks that it is deeply frozen. */
  function auditing(): { validator: Validator; calls: () => number } {
    const real = createValidator();
    let calls = 0;
    const check = (given: CanonicalState, copy: CanonicalState): void => {
      expect(given).toEqual(copy);
      expect(Object.isFrozen(given)).toBe(true);
      expect(Object.isFrozen(given.records.species)).toBe(true);
      calls += 1;
    };
    const validator: Validator = {
      ...real,
      validateAll(given, ...rest) {
        const copy = structuredClone(given);
        const out = real.validateAll(given, ...rest);
        check(given, copy);
        return out;
      },
      validateTouched(given, ...rest) {
        const copy = structuredClone(given);
        const out = real.validateTouched(given, ...rest);
        check(given, copy);
        return out;
      },
      validateTouchedByRule(given, ...rest) {
        const copy = structuredClone(given);
        const out = real.validateTouchedByRule(given, ...rest);
        check(given, copy);
        return out;
      },
    };
    return { validator, calls: () => calls };
  }

  it('validateAll and validateTouched in the compute replica leave the state deep-equal, frozen state included', () => {
    const audited = auditing();
    const store = makeStore(MAX);
    const { replica, unsubscribe } = followingReplica(store, { validator: audited.validator });
    expect(Object.isFrozen(replica.snapshot().state)).toBe(true);
    const copy = structuredClone(replica.snapshot().state);

    // validateAll, by revision
    expect(replica.validateAll(replica.revision() as number)).toMatchObject({ ok: true });
    expect(replica.snapshot().state).toEqual(copy);
    const afterLoad = audited.calls();
    expect(afterLoad).toBeGreaterThanOrEqual(2);

    // validateTouched (by rule) on every commit the replica follows
    const species = recordIn(store.getState(), 'species', SPECIES.id);
    mustCommit(store.dispatch(envelope('Note', { type: 'record.update', record: withFields(species, { notes: 'a note' }) })));
    mustCommit(store.dispatch(envelope('Note again', { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', SPECIES.id), { notes: 'a second note' }) })));
    unsubscribe();
    expect(audited.calls()).toBeGreaterThan(afterLoad);
    // the replica equals the store: the commits changed it, validation added nothing of its own
    expect(replica.snapshot().state).toEqual(store.getState());

    // validating twice gives the same answer and the same state
    const twice = loadedReplica(MAX, 1, { validator: audited.validator });
    const first = twice.validateAll(1);
    const second = twice.validateAll(1);
    expect(second).toEqual(first);
    expect(twice.snapshot().state).toEqual(MAX);
  });
});
