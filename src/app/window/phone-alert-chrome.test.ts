/** The phone's one-line alert for a student (step 8.3, C1): real problems stay; the storage line only after the visitor imported own data. */
import { describe, expect, it } from 'vitest';
import { INITIAL_STATUS, type AppStatus } from '@/app/services';
import { studyChrome, STUDIO_CHROME } from '@/ui/study-chrome';
import { alertOf } from './phone-alert';

const status = (patch: Partial<AppStatus>): AppStatus => ({ ...INITIAL_STATUS, stage: 'ready', mode: 'writer', ...patch });
const refused = status({ storage: { persistence: 'refused', message: null } });

describe('alertOf with the chrome rule', () => {
  it('Studio: "Storage: not persistent", as before', () => {
    expect(alertOf(refused)).toBe('Storage: not persistent');
    expect(alertOf(refused, STUDIO_CHROME)).toBe('Storage: not persistent');
  });
  it('Study without own data: no storage line', () => {
    expect(alertOf(refused, studyChrome('study', { ownData: false }))).toBeNull();
  });
  it('Study with own data: the storage line is back', () => {
    expect(alertOf(refused, studyChrome('study', { ownData: true }))).toBe('Storage: not persistent');
  });
  it('a failed save is told in Study too', () => {
    const failed = status({ save: { state: 'failed', lastSavedRevision: 1, pendingRevisions: 1, lastError: 'x', failureReason: null, deletablePeriodicSnapshotIds: [] } });
    expect(alertOf(failed, studyChrome('study', { ownData: false }))).toBe('Saving failed: your changes are not saved');
  });
});
