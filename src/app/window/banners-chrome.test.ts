/** What the banners show a student (step 8.3, C2 and C3): the storage warning only after the visitor imported own data, in the Study words; no layout note. */
import { describe, expect, it } from 'vitest';
import { INITIAL_STATUS, type AppStatus } from '@/app/services';
import { studyChrome, STUDIO_CHROME } from '@/ui/study-chrome';
import { bannersOf, STUDY_STORAGE_TEXT } from './banners';

const status = (patch: Partial<AppStatus>): AppStatus => ({ ...INITIAL_STATUS, stage: 'ready', mode: 'writer', ...patch });
const refused = status({ storage: { persistence: 'refused', message: 'the browser did not grant persistent storage; export a backup' }, layoutNotice: 'ELK fell back' });
const study = studyChrome('study', { ownData: false });
const studyOwn = studyChrome('study', { ownData: true });

describe('bannersOf with the chrome rule', () => {
  it('Studio (and no rule at all): the storage warning and the layout note, as before', () => {
    expect(bannersOf(refused).map((b) => b.id)).toEqual(['layout_notice', 'storage_refused']);
    expect(bannersOf(refused, { chrome: STUDIO_CHROME }).map((b) => b.id)).toEqual(['layout_notice', 'storage_refused']);
  });
  it('Study without own data: no storage warning (the published chemistry is re-loaded from the site) and no layout note', () => {
    expect(bannersOf(refused, { chrome: study })).toEqual([]);
    expect(bannersOf(status({ storage: { persistence: 'asking', message: null } }), { chrome: study })).toEqual([]);
  });
  it('Study with own data: the visitor wording with "Export a backup" and "Dismiss"; still no layout note', () => {
    const banners = bannersOf(refused, { chrome: studyOwn });
    expect(banners.map((b) => b.id)).toEqual(['storage_refused']);
    expect(banners[0]?.text).toBe('This browser may clear your imported data when space is short. Export a backup to keep it.');
    expect(STUDY_STORAGE_TEXT).toBe(banners[0]?.text);
    expect(banners[0]?.action).toEqual({ label: 'Dismiss', kind: 'dismiss_storage' });
    expect(banners[0]?.also).toEqual({ label: 'Export a backup', kind: 'export' });
  });
  it('Study with own data, dismissed: nothing', () => {
    expect(bannersOf(refused, { chrome: studyOwn, storageNoticeDismissed: true })).toEqual([]);
  });
  it('real problems are never hidden in Study: a failed save and a stopped worker still show', () => {
    const failing = status({ save: { state: 'failed', lastSavedRevision: 1, pendingRevisions: 1, lastError: 'quota', failureReason: null, deletablePeriodicSnapshotIds: [] } });
    expect(bannersOf(failing, { chrome: study }).map((b) => b.id)).toContain('save_failed');
  });
});
