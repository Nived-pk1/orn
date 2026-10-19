import { describe, expect, it } from 'vitest';
import { createPeriodicPolicy, PERIODIC_ACTIVITY_MS, PERIODIC_REVISIONS } from './snapshot-policy';

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
