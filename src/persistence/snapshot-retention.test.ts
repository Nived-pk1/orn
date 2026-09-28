import { describe, expect, it } from 'vitest';
import type { SnapshotReason, SnapshotSummary } from './contracts';
import { expiredPeriodicIds, oldestFirst, periodicIdsOldestFirst, PERIODIC_SNAPSHOTS_KEPT } from './snapshot-retention';

let n = 0;
const snap = (reason: SnapshotReason, minute: number, id = `snp_${(n += 1).toString().padStart(3, '0')}`): SnapshotSummary => ({
  id,
  createdAt: `2026-09-28T10:${String(minute).padStart(2, '0')}:00.000Z`,
  reason,
  revision: minute,
  schemaVersion: 1,
  byteSize: 10,
});

describe('snapshot retention', () => {
  it('keeps the newest five periodic snapshots', () => {
    expect(PERIODIC_SNAPSHOTS_KEPT).toBe(5);
    const periodic = Array.from({ length: 8 }, (_, i) => snap('periodic', i, `p${i}`));
    expect(expiredPeriodicIds(periodic)).toEqual(['p0', 'p1', 'p2']);
    expect(expiredPeriodicIds(periodic.slice(0, 5))).toEqual([]);
    expect(expiredPeriodicIds(periodic.slice(0, 2))).toEqual([]);
  });

  it('never expires mandatory reasons or manual snapshots, however many or old', () => {
    const others = (['pre_import', 'pre_migration', 'pre_restore', 'manual'] as const).flatMap((reason) =>
      Array.from({ length: 7 }, (_, i) => snap(reason, i)),
    );
    const periodic = Array.from({ length: 6 }, (_, i) => snap('periodic', 20 + i, `p${i}`));
    expect(expiredPeriodicIds([...others, ...periodic])).toEqual(['p0']);
    expect(expiredPeriodicIds(others)).toEqual([]);
  });

  it('orders by time whatever the input order, breaking ties on the ID', () => {
    const shuffled = [snap('periodic', 5, 'c'), snap('periodic', 1, 'a'), snap('periodic', 5, 'b'), snap('periodic', 3, 'z')];
    expect(periodicIdsOldestFirst(shuffled)).toEqual(['a', 'z', 'b', 'c']);
    expect(expiredPeriodicIds(shuffled, 1)).toEqual(['a', 'z', 'b']);
    expect(expiredPeriodicIds(shuffled, 0)).toEqual(['a', 'z', 'b', 'c']);
    expect([...shuffled].sort(oldestFirst).map((s) => s.id)).toEqual(['a', 'z', 'b', 'c']);
  });

  it('what is offered for deletion when storage is full is periodic only', () => {
    const all = [snap('manual', 1, 'm'), snap('pre_restore', 2, 'r'), snap('periodic', 4, 'p2'), snap('periodic', 3, 'p1')];
    expect(periodicIdsOldestFirst(all)).toEqual(['p1', 'p2']);
    expect(periodicIdsOldestFirst([])).toEqual([]);
  });
});
