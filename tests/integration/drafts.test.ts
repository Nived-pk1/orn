/**
 * Step 6.1a part 3, drafts kept and offered again (ADR-040) over fake-indexeddb and the real app services: a dirty session is stored within
 * 2 s and offered at the next boot with its local undo history; Save and Discard remove the row; a malformed row is listed and kept; a
 * promoted follower is offered the closed writer's drafts (PERSISTENCE §10); a follower lists none while another tab is the writer.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppServices } from '@/app/services';
import type { DraftRecipe } from '@/core/editing';
import { createBooter, demoState, tamper } from '@/test-support/app-boot-kit';
import { testEnv, worldHolding } from '@/test-support/app-env-kit';

const booter = createBooter();
afterEach(() => booter.disposeAll());

type Names = { canonical: string };
const rename = (name: string): DraftRecipe => (d) => {
  (d.names as Names).canonical = name;
};
const firstSpecies = (services: AppServices): string => Object.keys(services.store.getState().records.species).sort()[0] ?? '';

async function storedIds(world: Awaited<ReturnType<typeof worldHolding>>): Promise<string[]> {
  let ids: string[] = [];
  await tamper(world, async (db) => {
    ids = (await db.editorSessions.toArray()).map((row) => row.id).sort();
  });
  return ids;
}

/** A writer with one edited draft whose row is stored (the 2 s throttle fired by hand). */
async function writerWithDraft() {
  const world = await worldHolding(demoState(), 2);
  const t = testEnv({ world });
  const services = await booter.bootEnv(t);
    await services.drafts.refresh(); // the draft manager is a lazy chunk, loaded after the first paint in the app
  const opened = services.drafts.open({ kind: 'species', id: firstSpecies(services) });
  if (!opened.ok) throw new Error(opened.message);
  services.drafts.edit(opened.id, rename('First'), { path: 'names.canonical' });
  return { world, t, services, id: opened.id };
}

describe('a dirty session is stored within 2 s (a throttle) and offered at the next boot', () => {
  it('the first edit starts one 2 s timer; further edits do not restart it; the row appears when it fires, with its past', async () => {
    const { world, t, services, id } = await writerWithDraft();
    expect(services.drafts.entry(id)?.save.state).toBe('saving');
    expect(t.scheduler.liveDelays().filter((ms) => ms === 2000)).toHaveLength(1);
    services.drafts.edit(id, rename('Second'), { path: 'names.canonical' });
    services.drafts.edit(id, (d) => void ((d.names as Names).canonical = 'Third'));
    expect(t.scheduler.liveDelays().filter((ms) => ms === 2000)).toHaveLength(1);
    expect(await storedIds(world)).toEqual([]); // nothing is written before the timer
    expect(t.scheduler.fireAfter(2000)).toBe(true);
    await vi.waitFor(() => expect(services.drafts.entry(id)?.save.state).toBe('saved'));
    expect(await storedIds(world)).toEqual([id]);

    await services.dispose();
    const again = await booter.bootEnv(testEnv({ world }));
    await again.drafts.refresh(); // the draft manager is a lazy chunk, loaded after the first paint in the app
    expect(again.bootReport?.editorSessionIds).toEqual([id]); // offered, whether or not a crash is suspected
    await vi.waitFor(() => expect(again.drafts.view().count).toBe(1));
    const item = again.drafts.view().items[0];
    expect(item).toMatchObject({ id, unreadable: false, kind: 'species', isNew: false, changedSince: false });
    expect(again.drafts.openStored(id)).toEqual({ ok: true, id });
    const entry = again.drafts.entry(id);
    expect(entry?.session.past.length).toBeGreaterThan(0); // the local undo history came back
    expect(entry?.canUndo).toBe(true);
    again.drafts.undo(id);
    expect((again.drafts.entry(id)?.session.draft as { names: Names }).names.canonical).not.toBe('Third');
  });

  it('flush() (the page is hidden) saves at once and stops the timer', async () => {
    const { world, t, services, id } = await writerWithDraft();
    await services.drafts.flush();
    expect(services.drafts.entry(id)?.save.state).toBe('saved');
    expect(t.scheduler.liveDelays().filter((ms) => ms === 2000)).toHaveLength(0);
    expect(await storedIds(world)).toEqual([id]);
  });

  it('a draft whose record changed since it was started says so in the list', async () => {
    const { services, id } = await writerWithDraft();
    await services.drafts.flush();
    const species = firstSpecies(services);
    const record = services.store.getState().records.species[species as never] as { names: { canonical: string } };
    services.store.dispatch({
      label: 'Elsewhere',
      commands: [{ type: 'record.update', record: { ...record, names: { ...record.names, canonical: 'Changed elsewhere' } } as never }],
    });
    expect(services.drafts.view().items.find((i) => i.id === id)).toMatchObject({ changedSince: true });
  });
});

describe('Save and Discard remove the row', () => {
  it('Save (commit) deletes the row, one global history entry', async () => {
    const { world, services, id } = await writerWithDraft();
    await services.drafts.flush();
    expect(await storedIds(world)).toEqual([id]);
    const outcome = await services.drafts.commit(id, undefined, 'names');
    expect(outcome.ok).toBe(true);
    expect(await storedIds(world)).toEqual([]);
    expect(services.drafts.view().count).toBe(0);
    expect(services.store.historyLabels().undo).toHaveLength(1);
  });

  it('Discard deletes the row and forgets the session', async () => {
    const { world, services, id } = await writerWithDraft();
    await services.drafts.flush();
    await services.drafts.discard(id);
    expect(await storedIds(world)).toEqual([]);
    expect(services.drafts.entry(id)).toBeUndefined();
    expect(services.drafts.view().count).toBe(0);
  });

  it('a session that was opened and never edited leaves no row and is not a draft', async () => {
    const world = await worldHolding(demoState(), 2);
    const services = await booter.bootEnv(testEnv({ world }));
    await services.drafts.refresh(); // the draft manager is a lazy chunk, loaded after the first paint in the app
    const opened = services.drafts.open({ kind: 'species', id: firstSpecies(services) });
    if (!opened.ok) throw new Error(opened.message);
    await vi.waitFor(() => expect(services.drafts.view().count).toBe(0));
    services.drafts.release(opened.id);
    expect(services.drafts.entry(opened.id)).toBeUndefined();
    expect(await storedIds(world)).toEqual([]);
  });
});

describe('stored rows are untrusted', () => {
  it('a malformed row is listed as unreadable and kept until the user discards it', async () => {
    const world = await worldHolding(demoState(), 2);
    await tamper(world, (db) => db.editorSessions.put({ id: 'eds_broken', nonsense: true } as never));
    const services = await booter.bootEnv(testEnv({ world }));
    await services.drafts.refresh(); // the draft manager is a lazy chunk, loaded after the first paint in the app
    await vi.waitFor(() => expect(services.drafts.view().count).toBe(1));
    expect(services.drafts.view().items).toEqual([{ id: 'eds_broken', unreadable: true, reason: expect.any(String) }]);
    expect(await storedIds(world)).toEqual(['eds_broken']);
    await services.drafts.discardUnreadable('eds_broken');
    expect(await storedIds(world)).toEqual([]);
    expect(services.drafts.view().count).toBe(0);
  });
});

describe('bounds', () => {
  it('at most 20 stored sessions: opening a 21st is refused with the reason', async () => {
    const world = await worldHolding(demoState(), 2);
    const services = await booter.bootEnv(testEnv({ world }));
    await services.drafts.refresh(); // the draft manager is a lazy chunk, loaded after the first paint in the app
    const species = Object.keys(services.store.getState().records.species).sort();
    expect(species.length).toBeGreaterThan(20);
    for (const id of species.slice(0, 20)) {
      const opened = services.drafts.open({ kind: 'species', id });
      if (!opened.ok) throw new Error(opened.message);
      services.drafts.edit(opened.id, rename(`Edited ${id}`));
    }
    const refused = services.drafts.open({ kind: 'species', id: species[20] as string });
    expect(refused).toMatchObject({ ok: false, reason: 'too_many' });
    // a record that already has a session reopens it, whatever the count
    expect(services.drafts.open({ kind: 'species', id: species[0] as string }).ok).toBe(true);
  });

  it('a row over 1 MB is not saved and the draft says so; it stays open', async () => {
    const { world, services, id } = await writerWithDraft();
    services.drafts.edit(id, (d) => void ((d.names as Names).canonical = 'x'.repeat(10)));
    services.drafts.edit(id, (d) => void (d.notes = 'y'.repeat(1_100_000)));
    await services.drafts.flush();
    expect(services.drafts.entry(id)?.save).toMatchObject({ state: 'failed', reason: expect.stringMatching(/over 1 MB/) });
    expect(await storedIds(world)).toEqual([]);
  });

  it('one session per record: opening the editor again reopens the same session with its history', async () => {
    const { services, id } = await writerWithDraft();
    const again = services.drafts.open({ kind: 'species', id: services.drafts.entry(id)?.session.target?.id ?? '' });
    expect(again).toEqual({ ok: true, id });
  });
});

describe('tabs', () => {
  it('a follower opens nothing and lists nothing; a promoted follower is offered the closed writer\'s drafts (PERSISTENCE §10)', async () => {
    const { world, services: a, id } = await writerWithDraft();
    await a.drafts.flush();
    const b = await booter.bootEnv(testEnv({ world }));
    await b.drafts.refresh(); // the draft manager is a lazy chunk, loaded after the first paint in the app
    expect(b.status.get().mode).toBe('follower');
    expect(b.drafts.open({ kind: 'species', id: firstSpecies(b) })).toMatchObject({ ok: false, reason: 'read_only', message: 'This tab is read-only: edit in the tab that is saving' });
    expect(b.drafts.view()).toMatchObject({ count: null, keeping: 'read_only' });
    await a.dispose(); // the lock is released: b is promoted
    await vi.waitFor(() => expect(b.status.get().mode).toBe('writer'));
    await vi.waitFor(() => expect(b.drafts.view().count).toBe(1));
    expect(b.drafts.view().items[0]).toMatchObject({ id, unreadable: false });
    expect(b.drafts.view().keeping).toBe('stored');
  });

  it('a session-only tab edits in memory and keeps nothing', async () => {
    const services = await booter.bootEnv(testEnv({ noIndexedDb: true }));
    await services.drafts.refresh(); // the draft manager is a lazy chunk, loaded after the first paint in the app
    expect(services.status.get().mode).toBe('session_only');
    // a session-only tab starts empty: a new record's draft
    const opened = services.drafts.open({ kind: 'species' });
    if (!opened.ok) throw new Error(opened.message);
    services.drafts.edit(opened.id, (d) => void (d.notes = 'in memory'));
    expect(services.drafts.entry(opened.id)?.save).toEqual({ state: 'memory' });
    expect(services.drafts.view().keeping).toBe('memory');
    await services.drafts.flush();
  });
});
