// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { INITIAL_STATUS, type AppStatus } from '@/app/services';
import type { Finding, Severity } from '@/core/validation';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeApp, renderWithApp, WRITER_STATUS } from '@/test-support/window-kit';
import { Banners, BootLines, StatusLine } from './status-parts';
import { EditorsContext } from './drafts-ui';
import { vi } from 'vitest';
import { createLocalTimeFormatter } from './local-time';

afterEach(cleanup);

const finding = (id: string, severity: Severity, subject = `spc_${id}`): Finding => ({
  id, ruleId: 'TEST-001', level: 3, severity, subject: { kind: 'species', id: subject }, message: 'm', related: [],
});
const save = (patch: Partial<NonNullable<AppStatus['save']>>): NonNullable<AppStatus['save']> => ({
  state: 'saved', lastSavedRevision: 3, pendingRevisions: 0, lastError: null, failureReason: null, deletablePeriodicSnapshotIds: [], ...patch,
});

describe('the status line', () => {
  it('shows the save state, the finding counts and nothing else for a healthy writer', () => {
    const app = fakeApp({ status: { save: save({}) } });
    renderWithApp(app, <StatusLine />);
    const line = screen.getByRole('region', { name: 'Status' });
    expect(within(line).getByText('Saved (revision 3)')).toBeTruthy();
    expect(within(line).getByText('Findings: E 0 / W 0 / I 0 / Review 0')).toBeTruthy();
    expect(within(line).queryByText('Read-only')).toBeNull();
    expect(within(line).queryByText('Single tab only')).toBeNull();
  });

  it.each([
    [{ state: 'saving', pendingRevisions: 2 } as const, 'Applied, not saved yet: saving 2 changes'],
    [{ state: 'retrying', lastError: 'quota' } as const, 'Applied, not saved: retrying (quota)'],
    [{ state: 'failed', lastError: 'denied' } as const, 'Applied, NOT saved: saving failed (denied)'],
  ])('says "applied, not saved" while a change is not durable: %j', (patch, text) => {
    renderWithApp(fakeApp({ status: { save: save(patch) } }), <StatusLine />);
    expect(screen.getByText(text)).toBeTruthy();
    expect(screen.queryByText(/^Saved/)).toBeNull();
  });

  it('shows read-only, single tab, session-only and the running operation with its progress', () => {
    const app = fakeApp({
      status: {
        mode: 'follower', save: save({ state: 'read_only' }), singleTab: true,
        operation: { kind: 'import_apply', stage: 'committing', progress: { done: 2, total: 4 } },
      },
    });
    renderWithApp(app, <StatusLine />);
    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.getByText('Single tab only')).toBeTruthy();
    expect(screen.getByText('Applying an import: committing, 2 of 4')).toBeTruthy();
    act(() => void app.status.update({ mode: 'session_only', save: null, operation: null }));
    expect(screen.getByText('Not saved: this session keeps nothing')).toBeTruthy();
    expect(screen.queryByText(/Applying an import/)).toBeNull();
  });

  it('follows the finding store through its own subscription (L4 results arrive without a ChangeSet)', () => {
    const app = fakeApp();
    renderWithApp(app, <StatusLine />);
    act(() => app.store.findings.replaceForSubjects([{ kind: 'species', id: 'spc_a' }], [finding('a', 'warning')], 3));
    expect(screen.getByText('Findings: E 0 / W 1 / I 0 / Review 0')).toBeTruthy();
    act(() => app.store.findings.replaceForSubjects([{ kind: 'species', id: 'spc_b' }], [finding('b', 'error', 'spc_b'), finding('c', 'review_required', 'spc_b'), finding('d', 'info', 'spc_b')], 3));
    expect(screen.getByText('Findings: E 1 / W 1 / I 1 / Review 1')).toBeTruthy();
  });

  it('says it is starting while the services are booting', () => {
    renderWithApp(fakeApp({ status: { stage: 'booting', mode: null } }), <StatusLine />);
    expect(screen.getByText('Starting up')).toBeTruthy();
  });
});

describe('the banners: every one is rendered from AppStatus values, and its button acts', () => {
  it('renders nothing for a healthy status', () => {
    renderWithApp(fakeApp({ status: { save: save({}) } }), <Banners />);
    expect(screen.queryByRole('region', { name: 'Notices' })).toBeNull();
  });

  const cases: [string, Partial<AppStatus>, RegExp][] = [
    ['read-only follower', { mode: 'follower', reason: 'other_tab_is_writer' }, /another tab of this app is the writer/],
    ['read-only', { mode: 'read_only', reason: 'integrity_failure' }, /read-only \(integrity_failure\)/],
    ['single tab', { singleTab: true }, /no tab locks/],
    ['refused promotion', { mode: 'follower', promotion: 'refused', reason: 'lock_denied' }, /could not take over as the writer \(lock_denied\)/],
    ['revision gap', { save: save({ state: 'failed', failureReason: 'revision_gap', lastError: 'gap' }) }, /Saving stopped/],
    ['replica down', { replica: { state: 'down', reason: 'gave up', revision: null } }, /background copy used for checking data is down/],
    ['validation fallback', { validation: { where: 'main', reason: 'no worker' } }, /Data checks ran on this page/],
    ['session-only', { mode: 'session_only', reason: 'no_indexeddb' }, /Nothing is saved in this session/],
    ['engine unavailable', { engines: { ...INITIAL_STATUS.engines, chem: { state: 'unavailable', message: 'wasm' } } }, /Check unavailable/],
    ['a worker that gave up', { workers: { ...INITIAL_STATUS.workers, layout: { state: 'down', started: true, reason: 'cap' } } }, /Reload the page to start it again/],
    ['storage refused', { storage: { persistence: 'refused', message: null } }, /did not grant persistent storage/],
  ];
  it.each(cases)('%s', (_name, patch, text) => {
    renderWithApp(fakeApp({ status: { ...WRITER_STATUS, ...patch } }), <Banners />);
    expect(within(screen.getByRole('region', { name: 'Notices' })).getByText(text)).toBeTruthy();
  });

  it('Reload, "Save everything now" and Retry call the services', () => {
    const app = fakeApp({
      status: {
        mode: 'follower', promotion: 'refused', reason: 'lock_denied',
        save: save({ state: 'failed', failureReason: 'revision_gap', lastError: 'gap' }),
        replica: { state: 'down', reason: 'x', revision: null },
        engines: { chem: { state: 'unavailable', message: 'a' }, layout: { state: 'unavailable', message: 'b' } },
      },
    });
    renderWithApp(app, <Banners />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(app.reload).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Save everything now' }));
    expect(app.saveEverythingNow).toHaveBeenCalledTimes(1);
    const retries = screen.getAllByRole('button', { name: 'Retry' });
    expect(retries).toHaveLength(3);
    for (const button of retries) fireEvent.click(button);
    expect(app.retryReplica).toHaveBeenCalledTimes(1);
    expect(app.retryEngine.mock.calls).toEqual([['chem'], ['layout']]);
  });

  it('a worker that gave up has no Retry, only Reload', () => {
    const app = fakeApp({ status: { ...WRITER_STATUS, workers: { ...INITIAL_STATUS.workers, chem: { state: 'down', started: true, reason: 'cap' } } } });
    renderWithApp(app, <Banners />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(app.reload).toHaveBeenCalledTimes(1);
  });

  it('a banner appears and goes away as the status changes', () => {
    const app = fakeApp({ status: { save: save({}) } });
    renderWithApp(app, <Banners />);
    expect(screen.queryByText(/background copy/)).toBeNull();
    act(() => void app.status.update({ replica: { state: 'down', reason: 'x', revision: null } }));
    expect(screen.getByText(/background copy/)).toBeTruthy();
    act(() => void app.status.update({ replica: { state: 'in_sync', reason: '', revision: 1 } }));
    expect(screen.queryByText(/background copy/)).toBeNull();
  });
});

describe('records set aside (5.11b)', () => {
  it('says how many are stored while the count is above 0, singular for 1, nothing for 0, and follows the count', () => {
    const app = fakeApp({ status: { save: save({}), quarantinedCount: 0 } });
    renderWithApp(app, <StatusLine />);
    const line = screen.getByRole('region', { name: 'Status' });
    expect(within(line).queryByText(/set aside/)).toBeNull();
    act(() => void app.status.update({ quarantinedCount: 1 }));
    expect(within(line).getByText('1 record set aside')).toBeTruthy();
    act(() => void app.status.update({ quarantinedCount: 4 }));
    expect(within(line).getByText('4 records set aside')).toBeTruthy();
    expect(within(line).queryByText('1 record set aside')).toBeNull();
    act(() => void app.status.update({ quarantinedCount: 0 }));
    expect(within(line).queryByText(/set aside/)).toBeNull();
  });

  it('the line of a follower follows the count too (re-read from the database after a change from the writer)', () => {
    const app = fakeApp({ status: { mode: 'follower', reason: 'other_tab_is_writer', save: save({ state: 'read_only' }), quarantinedCount: 0 } });
    renderWithApp(app, <StatusLine />);
    const line = screen.getByRole('region', { name: 'Status' });
    expect(within(line).queryByText(/set aside/)).toBeNull();
    act(() => void app.status.update({ quarantinedCount: 3 }));
    expect(within(line).getByText('3 records set aside')).toBeTruthy();
  });

  it('does not depend on what this boot moved: no boot notice, and the line is still there', () => {
    renderWithApp(fakeApp({ status: { quarantinedCount: 2, notices: { crashSuspected: false, editorSessions: 0, quarantinedRows: 0, assetsWithoutBytes: 0, unverifiedAssetBlobs: 0, migrationSteps: 0 } } }), <StatusLine />);
    expect(screen.getByText('2 records set aside')).toBeTruthy();
  });
});

describe('automatic snapshots (6.1b)', () => {
  it('the status line (and so the phone Status dialog) says none yet, the last one and how many are kept, or that the attempt failed; nothing where the tab takes none', () => {
    const app = fakeApp({ status: { save: save({}), periodicSnapshots: null } });
    renderWithApp({ ...app, value: { ...app.value, formatTime: createLocalTimeFormatter('Asia/Kolkata') } }, <StatusLine />);
    const line = screen.getByRole('region', { name: 'Status' });
    expect(within(line).queryByText(/Automatic snapshots/)).toBeNull();
    act(() => void app.status.update({ periodicSnapshots: { lastAt: null, kept: 0, failure: null } }));
    expect(within(line).getByText('Automatic snapshots: none yet')).toBeTruthy();
    act(() => void app.status.update({ periodicSnapshots: { lastAt: '2026-10-18T10:35:12.000Z', kept: 3, failure: null } }));
    // the reader's zone (India), not UTC: the formatter is injected, the zone pinned
    expect(within(line).getByText('Automatic snapshots: last at 2026-10-18 16:05 GMT+5:30 (3 kept)')).toBeTruthy();
    act(() => void app.status.update({ periodicSnapshots: { lastAt: '2026-10-18T10:35:12.000Z', kept: 3, failure: 'the compute worker is not available' } }));
    expect(within(line).getByText('Automatic snapshots: last attempt failed: the compute worker is not available')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('the boot-report lines', () => {
  it('has one plain line for each notice', () => {
    renderWithApp(
      fakeApp({ status: { notices: { crashSuspected: true, editorSessions: 2, quarantinedRows: 1, assetsWithoutBytes: 2, unverifiedAssetBlobs: 1, migrationSteps: 3 } } }),
      <BootLines />,
    );
    const lines = within(screen.getByRole('region', { name: 'Start-up report' })).getAllByRole('listitem');
    expect(lines.map((l) => l.textContent)).toEqual([
      '1 stored row failed validation and was set aside (quarantined).',
      '2 asset records have no stored file.',
      '1 stored file was not verified.',
      '3 data migration steps ran at start-up.',
    ]);
  });

  it('never shows a crash line: a suspected crash is a Diagnostics fact (ADR-040)', () => {
    renderWithApp(
      fakeApp({ status: { notices: { crashSuspected: true, editorSessions: 0, quarantinedRows: 1, assetsWithoutBytes: 0, unverifiedAssetBlobs: 0, migrationSteps: 0 } } }),
      <BootLines />,
    );
    const lines = within(screen.getByRole('region', { name: 'Start-up report' })).getAllByRole('listitem');
    expect(lines.map((l) => l.textContent)).toEqual(['1 stored row failed validation and was set aside (quarantined).']);
    expect(screen.queryByText(/crash is suspected/)).toBeNull();
  });

  it('renders nothing for a suspected crash with no editor session and nothing else to report', () => {
    renderWithApp(fakeApp({ status: { notices: { crashSuspected: true, editorSessions: 0, quarantinedRows: 0, assetsWithoutBytes: 0, unverifiedAssetBlobs: 0, migrationSteps: 0 } } }), <BootLines />);
    expect(screen.queryByRole('region', { name: 'Start-up report' })).toBeNull();
  });

  it('renders nothing for a clean boot', () => {
    renderWithApp(fakeApp({ status: { notices: { crashSuspected: false, editorSessions: 0, quarantinedRows: 0, assetsWithoutBytes: 0, unverifiedAssetBlobs: 0, migrationSteps: 0 } } }), <BootLines />);
    expect(screen.queryByRole('region', { name: 'Start-up report' })).toBeNull();
  });
});

describe('the start-up line for unfinished drafts (ADR-040)', () => {
  const draftIn = (app: ReturnType<typeof fakeApp>): void => {
    const id = Object.keys(app.store.getState().records.species)[0] as string;
    const opened = app.drafts.open({ kind: 'species', id });
    if (!opened.ok) throw new Error(opened.message);
    app.drafts.edit(opened.id, (d) => void ((d.names as { canonical: string }).canonical = 'Edited'));
  };

  it('says "1 unfinished draft" with a "Show drafts" button that opens the list', () => {
    const app = fakeApp({ state: demoState() });
    draftIn(app);
    const open = vi.fn();
    renderWithApp(app, (
      <EditorsContext.Provider value={{ openDrafts: open, editNames: vi.fn(), newSpecies: vi.fn(), openDraft: vi.fn(), editReason: undefined }}>
        <BootLines />
      </EditorsContext.Provider>
    ));
    const region = screen.getByRole('region', { name: 'Start-up report' });
    expect(within(region).getByText(/^1 unfinished draft/).textContent).toContain('1 unfinished draft');
    fireEvent.click(within(region).getByRole('button', { name: 'Show drafts' }));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('says nothing without drafts, and no crash line even when a crash is suspected', () => {
    const app = fakeApp({ status: { notices: { crashSuspected: true, editorSessions: 0, quarantinedRows: 0, assetsWithoutBytes: 0, unverifiedAssetBlobs: 0, migrationSteps: 0 } } });
    renderWithApp(app, <BootLines />);
    expect(screen.queryByRole('region', { name: 'Start-up report' })).toBeNull();
  });

  it('counts a draft after it is made and stops when it is discarded', async () => {
    const app = fakeApp({ state: demoState() });
    renderWithApp(app, <BootLines />);
    expect(screen.queryByRole('region', { name: 'Start-up report' })).toBeNull();
    act(() => draftIn(app));
    expect(screen.getByText(/1 unfinished draft/)).toBeTruthy();
    const id = app.drafts.view().items[0]?.id as string;
    await act(async () => app.drafts.discard(id));
    expect(screen.queryByText(/unfinished draft/)).toBeNull();
  });
});
