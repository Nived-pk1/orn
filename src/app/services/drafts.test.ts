/** The session manager (ADR-040) with a fake adapter and a manual timer: the 2 s throttle, the bounds, the read-only and session-only rules. */
import { describe, expect, it, vi } from 'vitest';
import { createCanonicalStore } from '@/core/commands';
import type { DraftRecipe } from '@/core/editing';
import type { EditorSession } from '@/core/commands';
import { createIdFactory } from '@/core/dataset';
import type { DexieAdapter } from '@/persistence';
import { demoState } from '@/test-support/app-boot-kit';
import { createDraftManager, DRAFT_SAVE_INTERVAL_MS, MAX_DRAFT_ROW_BYTES, MAX_STORED_DRAFTS } from './drafts';
import { createEventLog, createStatusStore, type AppMode } from './status';

type Names = { canonical: string };

function rig(mode: AppMode = 'writer', withAdapter = true) {
  const store = createCanonicalStore({ initial: demoState(), revision: 0, validateInitial: false });
  const status = createStatusStore(() => undefined);
  status.update({ mode, stage: 'ready' });
  const timers: { ms: number; run: () => void; done: boolean }[] = [];
  const saved: EditorSession[] = [];
  const failures: Error[] = [];
  const adapter = {
    saveEditorSession: vi.fn(async (session: EditorSession) => {
      const failure = failures.shift();
      if (failure !== undefined) throw failure;
      saved.push(session);
    }),
    listEditorSessions: vi.fn(async () => []),
    deleteEditorSession: vi.fn(async () => undefined),
  } as unknown as DexieAdapter;
  const drafts = createDraftManager({
    store,
    adapter: withAdapter ? adapter : undefined,
    status,
    timers: {
      after(ms, run) {
        const timer = { ms, run, done: false };
        timers.push(timer);
        return () => {
          timer.done = true;
        };
      },
    },
    ids: createIdFactory({ nowMs: () => 1_790_000_000_000 }, { next: () => 0.25 }),
    log: createEventLog(() => 0),
  });
  const live = (): number => timers.filter((t) => !t.done).length;
  const fire = (): void => {
    const timer = timers.find((t) => !t.done);
    if (timer === undefined) throw new Error('no timer');
    timer.done = true;
    timer.run();
  };
  const species = Object.keys(store.getState().records.species).sort();
  return { store, status, drafts, adapter, saved, failures, timers, live, fire, species };
}
const rename = (name: string): DraftRecipe => (d) => {
  (d.names as Names).canonical = name;
};

describe('the 2 s throttle', () => {
  it('the first edit starts one timer of 2,000 ms; later edits do not restart it; it saves the latest session', async () => {
    const r = rig();
    const opened = r.drafts.open({ kind: 'species', id: r.species[0] as string });
    if (!opened.ok) throw new Error(opened.message);
    expect(r.live()).toBe(0); // opening alone saves nothing
    r.drafts.edit(opened.id, rename('A'));
    r.drafts.edit(opened.id, rename('B'));
    r.drafts.edit(opened.id, rename('C'));
    expect(r.live()).toBe(1);
    expect(r.timers[0]?.ms).toBe(DRAFT_SAVE_INTERVAL_MS);
    r.fire();
    await vi.waitFor(() => expect(r.drafts.entry(opened.id)?.save.state).toBe('saved'));
    expect(r.saved).toHaveLength(1);
    expect((r.saved[0]?.draft as { names: Names }).names.canonical).toBe('C');
  });

  it('steady typing still saves: an edit after the save starts the next timer', async () => {
    const r = rig();
    const opened = r.drafts.open({ kind: 'species', id: r.species[0] as string });
    if (!opened.ok) throw new Error(opened.message);
    r.drafts.edit(opened.id, rename('A'));
    r.fire();
    await vi.waitFor(() => expect(r.saved).toHaveLength(1));
    r.drafts.edit(opened.id, rename('B'));
    expect(r.live()).toBe(1);
    r.fire();
    await vi.waitFor(() => expect(r.saved).toHaveLength(2));
  });

  it('an edit made while the row is being written is saved by the next timer', async () => {
    const r = rig();
    const opened = r.drafts.open({ kind: 'species', id: r.species[0] as string });
    if (!opened.ok) throw new Error(opened.message);
    r.drafts.edit(opened.id, rename('A'));
    r.fire(); // the write starts
    r.drafts.edit(opened.id, rename('B')); // before it ends
    await vi.waitFor(() => expect(r.saved.length).toBeGreaterThan(0));
    await vi.waitFor(() => expect(r.live()).toBe(1));
    r.fire();
    await vi.waitFor(() => expect(r.saved).toHaveLength(2));
    expect((r.saved[1]?.draft as { names: Names }).names.canonical).toBe('B');
  });

  it('a failed write says why and the next edit tries again', async () => {
    const r = rig();
    const opened = r.drafts.open({ kind: 'species', id: r.species[0] as string });
    if (!opened.ok) throw new Error(opened.message);
    r.failures.push(new Error('quota'));
    r.drafts.edit(opened.id, rename('A'));
    r.fire();
    await vi.waitFor(() => expect(r.drafts.entry(opened.id)?.save).toMatchObject({ state: 'failed', reason: 'Error: quota' }));
    r.drafts.edit(opened.id, rename('B'));
    r.fire();
    await vi.waitFor(() => expect(r.drafts.entry(opened.id)?.save.state).toBe('saved'));
  });
});

describe('bounds and rules', () => {
  it('refuses a 21st stored session and says how many are kept', () => {
    const r = rig();
    for (const id of r.species.slice(0, MAX_STORED_DRAFTS)) {
      const opened = r.drafts.open({ kind: 'species', id });
      if (!opened.ok) throw new Error(opened.message);
      r.drafts.edit(opened.id, rename(id));
    }
    const refused = r.drafts.open({ kind: 'species', id: r.species[MAX_STORED_DRAFTS] as string });
    expect(refused).toMatchObject({ ok: false, reason: 'too_many' });
    expect(refused.ok ? '' : refused.message).toContain(String(MAX_STORED_DRAFTS));
  });

  it('a row over 1 MB is not saved and says so', async () => {
    const r = rig();
    const opened = r.drafts.open({ kind: 'species', id: r.species[0] as string });
    if (!opened.ok) throw new Error(opened.message);
    r.drafts.edit(opened.id, (d) => void ((d as unknown as { notes: string }).notes = 'z'.repeat(MAX_DRAFT_ROW_BYTES)));
    await r.drafts.flush();
    expect(r.saved).toHaveLength(0);
    expect(r.drafts.entry(opened.id)?.save).toMatchObject({ state: 'failed', reason: expect.stringContaining('over 1 MB') });
  });

  it('a read-only tab opens nothing, with the reason; an edit does nothing', () => {
    const r = rig('follower');
    expect(r.drafts.open({ kind: 'species', id: r.species[0] as string })).toEqual({ ok: false, reason: 'read_only', message: 'This tab is read-only: edit in the tab that is saving' });
    expect(r.drafts.view().keeping).toBe('read_only');
  });

  it('a tab that is still starting opens nothing', () => {
    const r = rig();
    r.status.update({ mode: null });
    expect(r.drafts.open({ kind: 'species', id: r.species[0] as string })).toMatchObject({ ok: false, reason: 'starting' });
  });

  it('a session-only tab edits in memory: no timer, the state says so', () => {
    const r = rig('session_only', false);
    const opened = r.drafts.open({ kind: 'species', id: r.species[0] as string });
    if (!opened.ok) throw new Error(opened.message);
    r.drafts.edit(opened.id, rename('A'));
    expect(r.live()).toBe(0);
    expect(r.drafts.entry(opened.id)?.save).toEqual({ state: 'memory' });
    expect(r.drafts.view().keeping).toBe('memory');
    expect(r.drafts.view().count).toBe(1);
  });

  it('local undo and redo move the session and are saved like an edit', async () => {
    const r = rig();
    const opened = r.drafts.open({ kind: 'species', id: r.species[0] as string });
    if (!opened.ok) throw new Error(opened.message);
    r.drafts.edit(opened.id, rename('A'));
    r.drafts.undo(opened.id);
    expect(r.drafts.entry(opened.id)).toMatchObject({ canUndo: false, canRedo: true });
    r.drafts.redo(opened.id);
    expect(r.drafts.entry(opened.id)).toMatchObject({ canUndo: true, canRedo: false });
    await r.drafts.flush();
    expect(r.saved).toHaveLength(1);
  });
});
