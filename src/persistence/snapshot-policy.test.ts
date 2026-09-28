import { describe, expect, it } from 'vitest';
import type { SnapshotSummary } from './contracts';
import type { PersistenceEvent } from './events';
import { createPeriodicPolicy, PERIODIC_ACTIVITY_MS, PERIODIC_REVISIONS, startPeriodicSnapshots } from './snapshot-policy';
import { envelope, makeStore, ref, recordIn, withFields } from '@/test-support/command-kit';

const MINUTE = 60_000;
function clockAt(start = 1_000_000) {
  let now = start;
  return { nowMs: () => now, advance: (ms: number) => void (now += ms) };
}

describe('periodic snapshot policy', () => {
  it('is 30 minutes of activity or 200 revisions', () => {
    expect(PERIODIC_ACTIVITY_MS).toBe(30 * MINUTE);
    expect(PERIODIC_REVISIONS).toBe(200);
  });

  it('becomes due exactly at the 200th revision, not before', () => {
    const policy = createPeriodicPolicy({ clock: clockAt() });
    const due = Array.from({ length: 200 }, () => policy.noteChange());
    expect(due.indexOf(true)).toBe(199);
    expect(due.filter(Boolean)).toHaveLength(1);
  });

  it('becomes due 30 minutes after the first change, measured on the injected clock', () => {
    const clock = clockAt();
    const policy = createPeriodicPolicy({ clock });
    expect(policy.noteChange()).toBe(false);
    clock.advance(30 * MINUTE - 1);
    expect(policy.noteChange()).toBe(false);
    clock.advance(1);
    expect(policy.noteChange()).toBe(true);
  });

  it('a long idle gap before the first edit does not count as activity', () => {
    const clock = clockAt();
    const policy = createPeriodicPolicy({ clock });
    clock.advance(5 * 60 * MINUTE);
    expect(policy.noteChange()).toBe(false);
    clock.advance(10 * MINUTE);
    expect(policy.noteChange()).toBe(false);
  });

  it('stays due until a snapshot is taken, then starts over', () => {
    const clock = clockAt();
    const policy = createPeriodicPolicy({ clock, revisions: 3 });
    expect([policy.noteChange(), policy.noteChange(), policy.noteChange(), policy.noteChange()]).toEqual([false, false, true, true]);
    policy.markSnapshotTaken();
    expect([policy.noteChange(), policy.noteChange(), policy.noteChange()]).toEqual([false, false, true]);
    policy.markSnapshotTaken();
    clock.advance(31 * MINUTE);
    expect(policy.noteChange()).toBe(false);
  });
});

describe('startPeriodicSnapshots', () => {
  function rig(options: { revisions?: number; failFirst?: number } = {}) {
    const clock = clockAt();
    const store = makeStore();
    const taken: { reason: string; revision: number }[] = [];
    const events: PersistenceEvent[] = [];
    let failures = options.failFirst ?? 0;
    let release: (() => void) | undefined;
    let hold = false;
    const snapshots = {
      async createSnapshot(reason: SnapshotSummary['reason'], _state: unknown, revision: number): Promise<SnapshotSummary> {
        if (hold) await new Promise<void>((resolve) => (release = resolve));
        if (failures > 0) {
          failures -= 1;
          throw new Error('disk full');
        }
        taken.push({ reason, revision });
        return { id: `snp_${taken.length}`, createdAt: 'x', reason, revision, schemaVersion: 1, byteSize: 1 };
      },
    };
    const policy = createPeriodicPolicy({ clock, revisions: options.revisions ?? 3 });
    const running = startPeriodicSnapshots({ store, snapshots, policy, onEvent: (e) => events.push(e) });
    const species = ref('species', Object.keys(store.getState().records.species)[0] as string);
    let n = 0;
    const edit = () => {
      n += 1;
      const record = recordIn(store.getState(), species.kind, species.id);
      return store.dispatch(envelope(`edit ${n}`, { type: 'record.update', record: withFields(record, { notes: `n${n}` }) }));
    };
    return { store, taken, events, running, edit, hold: (on: boolean) => void (hold = on), release: () => release?.() };
  }

  it('takes a periodic snapshot of the live revision when the policy says one is due', async () => {
    const r = rig();
    for (let i = 0; i < 3; i += 1) expect(r.edit().ok).toBe(true);
    await r.running.whenIdle();
    expect(r.taken).toEqual([{ reason: 'periodic', revision: r.store.getRevision() }]);
    for (let i = 0; i < 3; i += 1) r.edit();
    await r.running.whenIdle();
    expect(r.taken).toHaveLength(2);
  });

  it('writes one at a time: changes while a snapshot is being written do not start another', async () => {
    const r = rig({ revisions: 1 });
    r.hold(true);
    r.edit();
    r.edit();
    r.edit();
    r.hold(false);
    r.release();
    await r.running.whenIdle();
    expect(r.taken).toHaveLength(1);
  });

  it('a failed snapshot is reported and tried again at the next change', async () => {
    const r = rig({ revisions: 2, failFirst: 1 });
    r.edit();
    r.edit();
    await r.running.whenIdle();
    expect(r.taken).toEqual([]);
    expect(r.events).toEqual([{ type: 'periodic_snapshot_failed', message: 'Error: disk full' }]);
    r.edit();
    await r.running.whenIdle();
    expect(r.taken).toHaveLength(1);
  });

  it('stop() ends it', async () => {
    const r = rig({ revisions: 1 });
    r.running.stop();
    r.edit();
    await r.running.whenIdle();
    expect(r.taken).toEqual([]);
  });
});
