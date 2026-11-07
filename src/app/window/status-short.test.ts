/** The short status bar (step 8.4a, Part C2): "Saved · rev 21 | Findings 0 · 0 · 143 | Review 1975 | Workers ok | Snapshot 2 Nov, 14:44". */
import { describe, expect, it } from 'vitest';
import { INITIAL_STATUS, type AppStatus } from '@/app/services';
import { shortStatusOf } from './status-short';

const status = (patch: Partial<AppStatus>): AppStatus => ({ ...INITIAL_STATUS, stage: 'ready', mode: 'writer', ...patch });
const saved = (rev: number): NonNullable<AppStatus['save']> => ({ state: 'saved', lastSavedRevision: rev, pendingRevisions: 0, lastError: null, failureReason: null, deletablePeriodicSnapshotIds: [] });
const counts = { error: 0, warning: 0, info: 143, review_required: 1975 };
const time = (iso: string): string => (iso === '2026-11-02T14:44:00.000Z' ? '2 Nov, 14:44' : iso);
const shorts = (s: AppStatus): string[] => shortStatusOf(s, counts, time, 0).map((i) => i.short);

describe('shortStatusOf', () => {
  it('the usual line', () => {
    const periodic = { lastAt: '2026-11-02T14:44:00.000Z', kept: 2, failure: null } as unknown as AppStatus['periodicSnapshots'];
    const out = shorts(status({ save: saved(21), periodicSnapshots: periodic, workers: { chem: { state: 'ok', started: true, reason: '' }, layout: { state: 'ok', started: true, reason: '' }, search: { state: 'ok', started: true, reason: '' } } as AppStatus['workers'], replica: { state: 'in_sync', reason: '', revision: 21 } as AppStatus['replica'] }));
    expect(out).toEqual(['Saved · rev 21', 'Findings 0 · 0 · 143', 'Review 1975', 'Workers ok', 'Snapshot 2 Nov, 14:44']);
  });
  it('every item keeps its full words for the tooltip and the details', () => {
    const items = shortStatusOf(status({ save: saved(21) }), counts, time, 0);
    expect(items[0]?.full).toBe('Saved (revision 21)');
    expect(items[1]?.full).toBe('Findings: E 0 / W 0 / I 143 / Review 1975');
  });
  it('a worker that is not ok is named; a count of layout notes is an item of its own', () => {
    const down = status({ save: saved(1), replica: { state: 'down', reason: 'x', revision: null } as AppStatus['replica'] });
    expect(shorts(down)).toContain('Workers: compute down');
    expect(shortStatusOf(status({ save: saved(1) }), counts, time, 2).some((i) => i.short === 'Layout notes (2)' && i.id === 'layout_notes')).toBe(true);
  });
  it('not saved and read-only are said, not hidden', () => {
    expect(shorts(status({ save: null }))[0]).toBe('Not saved');
    expect(shorts(status({ save: { ...saved(2), state: 'read_only' } }))[0]).toBe('Read-only');
  });
});
