import { describe, expect, it } from 'vitest';
import { INITIAL_STATUS, type AppStatus } from '@/app/services';
import { STUDIO_CHROME, studyChrome } from '@/ui/study-chrome';
import { alertOf, STUDY_STORAGE_ALERT } from './phone-alert';

const status = (patch: Partial<AppStatus>): AppStatus => ({ ...INITIAL_STATUS, stage: 'ready', mode: 'writer', ...patch });
const save = (patch: Partial<NonNullable<AppStatus['save']>>): NonNullable<AppStatus['save']> => ({
  state: 'saved', lastSavedRevision: 3, pendingRevisions: 0, lastError: null, failureReason: null, deletablePeriodicSnapshotIds: [], ...patch,
});

describe('alertOf (the phone status alert line, ADR-039)', () => {
  it('a healthy writer has no alert', () => {
    expect(alertOf(status({ save: save({}) }))).toBeNull();
  });

  it.each([
    ['save failed', { save: save({ state: 'failed', lastError: 'disk full' }) } as Partial<AppStatus>, /Saving failed/],
    ['storage not persistent', { storage: { persistence: 'refused', message: null } } as Partial<AppStatus>, /^Storage: not persistent$/],
    ['a worker down', { workers: { ...INITIAL_STATUS.workers, chem: { state: 'down', reason: 'crashed', started: true } } } as Partial<AppStatus>, /worker stopped/],
    ['the replica down', { replica: { state: 'down', reason: 'gave up', revision: null } } as Partial<AppStatus>, /worker stopped/],
    ['an engine that could not start', { engines: { ...INITIAL_STATUS.engines, chem: { state: 'unavailable', message: 'wasm' } } } as Partial<AppStatus>, /engine could not start/],
    ['records set aside', { quarantinedCount: 3 } as Partial<AppStatus>, /^3 records set aside$/],
    ['a session that keeps nothing', { mode: 'session_only', reason: 'indexeddb_unavailable' } as Partial<AppStatus>, /Nothing is saved/],
  ])('%s', (_name, patch, text) => {
    expect(alertOf(status({ save: save({}), ...patch }))).toMatch(text);
  });

  it('a student with their own data gets the student words, not the author status words (8.3b 0.3)', () => {
    const refused = status({ save: save({}), storage: { persistence: 'refused', message: null } });
    expect(alertOf(refused, studyChrome('study', { ownData: true }))).toBe(STUDY_STORAGE_ALERT);
    expect(STUDY_STORAGE_ALERT).toBe('Your data may be cleared. Back it up.');
    expect(alertOf(refused, STUDIO_CHROME)).toBe('Storage: not persistent');
    expect(alertOf(refused, studyChrome('study', { ownData: false }))).toBeNull();
  });

  it('says the most important thing first: a failed save before storage', () => {
    expect(alertOf(status({ save: save({ state: 'failed' }), storage: { persistence: 'refused', message: null } }))).toMatch(/Saving failed/);
  });
});
