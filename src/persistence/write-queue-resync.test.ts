/** Queue additions of step 3.3: switchable read-only, the revision-gap reason, and resync after a full re-save. */
import { describe, expect, it } from 'vitest';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';
import { history, rig } from '@/test-support/queue-rig';

describe('write queue: setReadOnly', () => {
  it('switches between read_only and saved, refuses writes while read-only, and reports the change', async () => {
    const { states, changes } = history(2);
    const r = rig();
    r.queue.setReadOnly(true);
    expect(r.queue.getStatus().state).toBe('read_only');
    expect(() => r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState)).toThrow(/read-only/);
    await expect(r.queue.runOrdered(async () => 1)).rejects.toThrow(/read-only/);
    r.queue.setReadOnly(false);
    expect(r.queue.getStatus().state).toBe('saved');
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.queue.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 1 });
    expect(r.statuses.map((s) => s.state)).toEqual(['read_only', 'saved', 'saving', 'saved']);
  });

  it('setting read-write on a queue that is not read-only changes nothing', () => {
    const r = rig();
    r.queue.setReadOnly(false);
    expect(r.statuses).toEqual([]);
  });
});

describe('write queue: a revision gap has its own reason, and resync recovers from it', () => {
  it('the gap sets failed with failureReason revision_gap, and the queue keeps refusing until resynced', async () => {
    const { states, changes } = history(4);
    const r = rig({ initialRevision: 0 });
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(() => r.queue.enqueue(changes[2] as ChangeSet, states[2] as CanonicalState)).toThrow(/does not follow 1/);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', failureReason: 'revision_gap', lastSavedRevision: 1, lastError: expect.stringContaining('replaceAll') });
    expect(() => r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState)).toThrow(/does not follow/);
  });

  it('resync(revision) clears the reason, reports saved at that revision, and continues from there', async () => {
    const { states, changes } = history(5);
    const r = rig({ initialRevision: 0 });
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(() => r.queue.enqueue(changes[3] as ChangeSet, states[3] as CanonicalState)).toThrow();
    await r.queue.runOrdered(async () => r.queue.resync(4));
    expect(r.queue.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 4, pendingRevisions: 0 });
    await r.queue.enqueue(changes[4] as ChangeSet, states[4] as CanonicalState);
    expect(r.queue.getStatus()).toMatchObject({ state: 'saved', lastSavedRevision: 5 });
    expect(() => r.queue.enqueue(changes[4] as ChangeSet, states[4] as CanonicalState)).toThrow(/does not follow 5/);
  });

  it('resync supersedes pending ChangeSets up to its revision, and keeps newer ones', async () => {
    const { states, changes } = history(4);
    const r = rig({ retryDelaysMs: [], initialRevision: 0 });
    r.script.fail.push(() => new Error('down'));
    await r.queue.enqueue(changes[0] as ChangeSet, states[0] as CanonicalState);
    expect(r.queue.pendingRevision()).toBe(1);
    expect(r.queue.getStatus()).toMatchObject({ state: 'failed', pendingRevisions: 1 });
    await r.queue.runOrdered(async () => r.queue.resync(1));
    expect(r.queue.pendingRevision()).toBeUndefined();
    expect(r.queue.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 1, pendingRevisions: 0 });

    await r.queue.enqueue(changes[1] as ChangeSet, states[1] as CanonicalState);
    // A ChangeSet that arrives while the full re-save is being written is newer than the state that was saved.
    await r.queue.runOrdered(async () => {
      void r.queue.enqueue(changes[2] as ChangeSet, states[2] as CanonicalState);
      expect(r.queue.pendingRevision()).toBe(3);
      r.queue.resync(2);
      expect(r.queue.pendingRevision()).toBe(3);
      expect(r.queue.getStatus()).toMatchObject({ state: 'saving', lastSavedRevision: 2, pendingRevisions: 1 });
    });
    await r.queue.flush();
    expect(r.queue.getStatus()).toEqual({ state: 'saved', lastSavedRevision: 3, pendingRevisions: 0 });
  });
});
