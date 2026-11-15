/** The backup record in uiState (step 8.4s, S4): marks, dismissals, reload, and nothing written by a tab that cannot write. */
import { describe, expect, it, vi } from 'vitest';
import { createBackupRecord, DISMISSED_KEY, LAST_BACKUP_KEY } from './backup-record';

const NOW = Date.parse('2026-11-14T12:00:00.000Z');

function rig(uiState: Record<string, unknown> = {}, mode: 'writer' | 'follower' = 'writer') {
  const setUiState = vi.fn(() => Promise.resolve());
  const record = createBackupRecord({ bootReport: { uiState } as never, persistence: { setUiState } as never, status: { get: () => ({ mode }) } as never }, () => NOW);
  return { record, setUiState };
}

describe('the backup record', () => {
  it('starts from the stored marks (tolerantly) and from nothing', () => {
    expect(rig().record.get()).toEqual({ last: undefined, dismissed: undefined });
    const stored = { [LAST_BACKUP_KEY]: { revision: 7, at: '2026-11-13T12:00:00.000Z' }, [DISMISSED_KEY]: 'junk' };
    expect(rig(stored).record.get()).toEqual({ last: { revision: 7, at: '2026-11-13T12:00:00.000Z' }, dismissed: undefined });
  });
  it('a finished Everything export writes lastBackup with the revision it exported and the injected time', () => {
    const { record, setUiState } = rig();
    const heard = vi.fn();
    record.subscribe(heard);
    record.markBackedUp(42);
    expect(record.get().last).toEqual({ revision: 42, at: '2026-11-14T12:00:00.000Z' });
    expect(setUiState).toHaveBeenCalledWith(LAST_BACKUP_KEY, { revision: 42, at: '2026-11-14T12:00:00.000Z' });
    expect(heard).toHaveBeenCalledTimes(1);
  });
  it('a backup also clears an older dismissal', () => {
    const { record } = rig({ [DISMISSED_KEY]: { revision: 3, at: '2026-11-13T12:00:00.000Z' } });
    record.markBackedUp(10);
    expect(record.get().dismissed).toBeUndefined();
  });
  it('Dismiss remembers the revision and the time', () => {
    const { record, setUiState } = rig();
    record.dismiss(300);
    expect(record.get().dismissed).toEqual({ revision: 300, at: '2026-11-14T12:00:00.000Z' });
    expect(setUiState).toHaveBeenCalledWith(DISMISSED_KEY, { revision: 300, at: '2026-11-14T12:00:00.000Z' });
  });
  it('a tab that cannot write keeps the marks in memory and writes nothing', () => {
    const { record, setUiState } = rig({}, 'follower');
    record.markBackedUp(5);
    expect(record.get().last?.revision).toBe(5);
    expect(setUiState).not.toHaveBeenCalled();
  });
});
