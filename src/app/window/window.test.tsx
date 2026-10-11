// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tierState } from '@/test-support/perf-kit';
import { fakeLayout } from '@/test-support/inspector-kit';
import { fakeApp, planOf, renderWithApp, stubDialog, type FakeApp } from '@/test-support/window-kit';

// jsdom has no showModal() / close() on <dialog>; the browser behaviour is proved by the e2e (tests/e2e/shell.spec.ts).
beforeAll(() => {
  stubDialog();
  fakeLayout();
});
afterEach(cleanup);

const APPLIED = { ok: true, revision: 1, snapshotId: 's', report: {}, reportSaved: true, saved: true, sessionOnly: false, save: null, inProcess: false, notes: [] };
const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const fileInput = (): HTMLInputElement => screen.getByLabelText('Choose a file to import') as HTMLInputElement;
const choose = (name: string): void => {
  fireEvent.change(fileInput(), { target: { files: [new File(['{}'], name)] } });
};

function app(options: Parameters<typeof fakeApp>[0] = {}): FakeApp {
  const a = fakeApp(options);
  a.flows.preview.mockResolvedValue({ ok: true, plan: planOf(), inProcess: false });
  a.flows.apply.mockResolvedValue(APPLIED);
  return a;
}

describe('first run (the store holds zero records)', () => {
  it('offers Load demo dataset, Import a file and Start empty', () => {
    renderWithApp(app());
    const region = screen.getByRole('region', { name: 'First run' });
    expect(within(region).getByRole('button', { name: 'Load demo dataset' })).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Import a file' })).toBeTruthy();
    expect(within(region).getByRole('button', { name: 'Start empty' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Organic Reaction Navigator' })).toBeTruthy();
  });

  it('waits while booting and refuses (in words) in a read-only tab', () => {
    renderWithApp(app({ status: { stage: 'booting', mode: null } }));
    expect(screen.getByRole('status', { name: 'Starting up' }).getAttribute('aria-busy')).toBe('true'); // a skeleton, not a spinner
    expect(screen.queryByRole('button', { name: 'Load demo dataset' })).toBeNull();
    cleanup();
    renderWithApp(app({ status: { mode: 'follower' } }));
    expect(screen.getByText(/This tab is read-only, so it cannot load data/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load demo dataset' })).toBeNull();
  });

  it('Load demo dataset goes through the import pipeline as replace_all and applies without a confirm step', async () => {
    const a = app();
    renderWithApp(a);
    fireEvent.click(button('Load demo dataset'));
    await screen.findByText('Imported 5 records from demo.orn.json.');
    expect(a.loadDemo).toHaveBeenCalledTimes(1);
    const [blob, fileName, request, options] = a.flows.preview.mock.calls[0] as [Blob, string, unknown, { inProcess: boolean; signal: AbortSignal }];
    expect(blob).toBeInstanceOf(Blob);
    expect(fileName).toBe('demo.orn.json');
    expect(request).toEqual({ mode: 'replace_all' });
    expect(options.inProcess).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(a.flows.apply).toHaveBeenCalledWith('batch-1', expect.objectContaining({ mode: 'replace_all' }), expect.objectContaining({ inProcess: false }));
  });

  it('a demo plan that cannot be confirmed shows its blockers and is not applied', async () => {
    const a = app();
    a.flows.preview.mockResolvedValue({ ok: true, plan: planOf({ canConfirm: false, blockers: ['REF-001 on spc_x'] }), inProcess: false });
    renderWithApp(a);
    fireEvent.click(button('Load demo dataset'));
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(within(screen.getByRole('list', { name: 'Blockers' })).getByText('REF-001 on spc_x')).toBeTruthy();
    expect(button('Confirm').getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Confirm', description: 'REF-001 on spc_x' })).toBeTruthy();
    fireEvent.click(button('Confirm'));
    expect(a.flows.apply).not.toHaveBeenCalled();
  });

  it('a demo file that cannot be fetched says why', async () => {
    const a = app();
    a.loadDemo.mockResolvedValue({ ok: false, message: 'the server answered 404' });
    renderWithApp(a);
    fireEvent.click(button('Load demo dataset'));
    await screen.findByText('The demo dataset could not be loaded: the server answered 404');
    expect(a.flows.preview).not.toHaveBeenCalled();
  });

  it('Start empty shows the dataset view with an empty-dataset note', () => {
    const a = app();
    renderWithApp(a);
    fireEvent.click(button('Start empty'));
    expect(screen.queryByRole('region', { name: 'First run' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Dataset' })).toBeTruthy();
    expect(screen.getByText('The dataset is empty.')).toBeTruthy();
    expect(screen.getByText(/Started empty/)).toBeTruthy();
    expect(a.panels.getState().startEmptyDismissed).toBe(true); // kept in the panels store (uiState), not in React state
  });
});

describe('Import a file', () => {
  it('shows the preview in words (counts per kind, findings, decisions at their defaults), then Confirm applies', async () => {
    const a = app();
    a.flows.preview.mockResolvedValue({
      ok: true,
      inProcess: false,
      plan: planOf({ decisions: [{ id: 'd1', subject: { kind: 'class', id: 'cls_x' }, question: 'Which hub class?', options: ['a', 'b'], chosen: 'a' }], migrationsApplied: ['v1-to-v2'] }),
    });
    renderWithApp(a);
    fireEvent.click(button('Import a file'));
    choose('mine.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(a.flows.preview.mock.calls[0]?.[1]).toBe('mine.orn.json');
    expect(a.flows.preview.mock.calls[0]?.[2]).toEqual({ mode: 'replace_all' });
    const kinds = within(screen.getByRole('list', { name: 'Records per kind' }));
    expect(kinds.getByText('species: 3 in the file — 3 new, 0 identical, 0 conflicting')).toBeTruthy();
    expect(kinds.getByText('reaction: 2 in the file — 2 new, 0 identical, 0 conflicting')).toBeTruthy();
    expect(screen.getByText(/0 errors, 1 warnings, 0 notes, 0 to review \(1 in all\)/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Decision: Which hub class?' })).toHaveProperty('value', 'a');
    expect(screen.getByText(/The file was brought up to date first: v1-to-v2\./)).toBeTruthy();
    expect(a.flows.apply).not.toHaveBeenCalled();
    fireEvent.click(button('Confirm'));
    await screen.findByText('Imported 5 records from mine.orn.json.');
    expect(a.flows.apply).toHaveBeenCalledWith('batch-1', expect.objectContaining({ mode: 'replace_all' }), expect.objectContaining({ inProcess: false }));
  });

  it('Cancel discards the pending batch and applies nothing', async () => {
    const a = app();
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    fireEvent.click(button('Cancel'));
    expect(a.flows.cancel).toHaveBeenCalledWith('batch-1');
    expect(a.flows.apply).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Import summary' })).toBeNull();
  });

  it('blockers disable Confirm and are listed', async () => {
    const a = app();
    a.flows.preview.mockResolvedValue({ ok: true, inProcess: false, plan: planOf({ canConfirm: false, blockers: ['an ERROR in the merged result'] }) });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(button('Confirm').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button('Confirm'));
    expect(a.flows.apply).not.toHaveBeenCalled();
    expect(within(screen.getByRole('list', { name: 'Blockers' })).getByText('an ERROR in the merged result')).toBeTruthy();
  });

  it('a file with no usable dataset information is shown as a merge, and the preview says so', async () => {
    const a = app();
    a.flows.preview.mockResolvedValueOnce({ ok: false, code: 'INVALID_META', message: 'datasetId is empty' });
    a.flows.preview.mockResolvedValueOnce({ ok: true, plan: planOf({}, { mode: 'merge' }), inProcess: false });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(a.flows.preview.mock.calls[1]?.[2]).toEqual({ mode: 'merge' });
    expect(screen.getByText(/no usable dataset information \(datasetId is empty\).*shown as a merge/)).toBeTruthy();
  });

  it('a worker that is down offers the in-page path (never taken silently), and the second ask uses it', async () => {
    const a = app();
    a.flows.preview.mockResolvedValueOnce({ ok: false, code: 'WORKER_DOWN', message: 'no compute worker', inProcessAvailable: true });
    a.flows.preview.mockResolvedValueOnce({ ok: true, plan: planOf(), inProcess: true });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByText(/worker that reads files stopped \(no compute worker\)/);
    expect(a.flows.preview).toHaveBeenCalledTimes(1);
    fireEvent.click(button('Read it on this page'));
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(a.flows.preview.mock.calls[1]?.[3]).toMatchObject({ inProcess: true });
    fireEvent.click(button('Confirm'));
    await waitFor(() => expect(a.flows.apply).toHaveBeenCalled());
    expect(a.flows.apply.mock.calls[0]?.[2]).toMatchObject({ inProcess: true });
  });

  it('refusals are plain text; Dismiss clears them', async () => {
    const a = app();
    a.flows.preview.mockResolvedValueOnce({ ok: false, code: 'NEWER_SCHEMA', message: 'schema 9 is newer' });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByText(/saved by a newer version of the app/);
    fireEvent.click(button('Dismiss'));
    expect(screen.queryByText(/newer version of the app/)).toBeNull();
  });

  it('an apply that is refused says so; an apply that is not saved yet says "not saved"', async () => {
    const a = app();
    a.flows.apply.mockResolvedValueOnce({ ok: false, code: 'STALE_REVISION', message: 'the data changed' });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    fireEvent.click(button('Confirm'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Your data changed since the preview/);
    cleanup();
    const b = app();
    b.flows.apply.mockResolvedValueOnce({ ...APPLIED, saved: false, save: null, notes: ['a note'], reportSaved: false, reportError: 'quota' });
    renderWithApp(b);
    choose('y.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    fireEvent.click(button('Confirm'));
    await screen.findByText(/Applied 5 records from y\.orn\.json, but not saved yet/);
    const toast = screen.getByRole('status', { name: 'Notifications' });
    expect(toast.textContent).toContain('a note');
    expect(toast.textContent).toContain('The import report could not be stored (quota).');
  });

  it('a session-only import says applied, not saved: nothing is stored in this tab', async () => {
    const a = app({ status: { mode: 'session_only', save: null } });
    a.flows.apply.mockResolvedValueOnce({ ...APPLIED, saved: false, sessionOnly: true });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    fireEvent.click(button('Confirm'));
    await screen.findByText(/Applied 5 records from x\.orn\.json, not saved: nothing is stored in this tab\./);
  });

  it('Cancel while the file is being read aborts the preview', async () => {
    const a = app();
    let signal: AbortSignal | undefined;
    a.flows.preview.mockImplementation((_b: Blob, _n: string, _r: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((resolve) => options.signal.addEventListener('abort', () => resolve({ ok: false, code: 'CANCELLED', message: 'cancelled' })));
    });
    renderWithApp(a);
    choose('big.orn.json');
    await screen.findByText('big.orn.json');
    fireEvent.click(button('Cancel'));
    await waitFor(() => expect(screen.queryByText('big.orn.json')).toBeNull());
    expect(signal?.aborted).toBe(true);
  });

  it('a hostile file name is shown as text', async () => {
    const a = app();
    renderWithApp(a);
    choose('<img src=x onerror=alert(1)>.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>.json')).toBeTruthy();
  });
});

describe('a dataset with data', () => {
  it('shows the record counts per kind (under Dataset) and no first-run buttons; the result of an import stays visible', async () => {
    const a = app({ state: tierState('tiny', 'dense') });
    renderWithApp(a);
    expect(screen.queryByRole('region', { name: 'First run' })).toBeNull();
    fireEvent.click(button('Dataset')); // step 5.5a: with records the canvas shows the navigator; the counts moved to the Dataset mode
    const counts = within(screen.getByRole('list', { name: 'Record counts' })).getAllByRole('listitem');
    expect(counts.length).toBeGreaterThan(0);
    expect(counts.every((li) => /^[a-z ]+: \d+$/.test(li.textContent ?? ''))).toBe(true);
    // the first-run screen goes away when the data arrives, but its result line must not
    cleanup();
    const b = app();
    renderWithApp(b);
    fireEvent.click(button('Load demo dataset'));
    await screen.findByText('Imported 5 records from demo.orn.json.');
    act(() => {
      const replaced = b.store.replaceState(tierState('tiny', 'dense'), 'import');
      expect(replaced.ok).toBe(true);
    });
    expect(screen.queryByRole('region', { name: 'First run' })).toBeNull();
    fireEvent.click(button('Dataset'));
    expect(screen.getByRole('region', { name: 'Dataset' })).toBeTruthy();
    expect(screen.getByText('Imported 5 records from demo.orn.json.')).toBeTruthy();
  });
});

describe('the shell frame around the window', () => {
  it('Navigator and Dataset are the enabled modes; the others are listed with the phase that brings them', () => {
    renderWithApp(app());
    const rail = within(screen.getByRole('navigation', { name: 'Modes' }));
    expect(rail.getByRole('button', { name: 'Navigator' }).getAttribute('aria-current')).toBe('page');
    for (const [name, phase] of [['Reactions', 'Phase 7'], ['Syllabus', 'Phase 7'], ['Workbench', 'Phase 6']] as const) {
      const mode = rail.getByRole('button', { name: new RegExp(name) });
      expect(mode.getAttribute('aria-disabled')).toBe('true');
      expect(within(mode).getByText(phase)).toBeTruthy();
    }
  });

  it('the top bar lists what does not exist yet as unavailable, with the reason (Search, the exam scope, Undo and Redo exist since 5.8)', () => {
    renderWithApp(app());
    // Search exists since step 5.8 (it opens the palette); Undo and Redo reflect the store and say why they cannot act
    expect(screen.getByRole('button', { name: 'Search' }).getAttribute('aria-disabled')).toBeNull();
    for (const [name, reason] of [['Undo', 'Nothing to undo'], ['Redo', 'Nothing to redo']] as const) {
      expect(screen.getByRole('button', { name, description: `${reason} (editing arrives in Phase 6)` }).getAttribute('aria-disabled')).toBe('true');
    }
    expect(screen.getByRole('combobox', { name: /Exam scope/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'File' })).toBeTruthy();
  });

  it('the inspector starts closed (step 5.5a review, item g); a saved choice to open it wins', () => {
    renderWithApp(app());
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    cleanup();
    renderWithApp(app({ panels: { stored: { inspectorOpen: true } } }));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
  });

  it('the inspector shows an empty state, the status line sits in the status bar, banners in the banner region', () => {
    renderWithApp(app({ status: { singleTab: true }, panels: { stored: { inspectorOpen: true } } }));
    expect(within(screen.getByRole('complementary', { name: 'Inspector' })).getByRole('region', { name: 'Inspector empty state' })).toBeTruthy();
    expect(within(screen.getByRole('contentinfo')).getByRole('region', { name: 'Status' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Notices' }).textContent).toContain('no tab locks');
    expect(screen.getByRole('main').textContent).not.toContain('no tab locks');
  });

  it('a panel change reaches the panels store; a read-only tab says its layout is not saved', () => {
    const a = app({ status: { mode: 'follower' }, panels: { mode: () => 'read_only', stored: { inspectorOpen: true } } });
    renderWithApp(a);
    expect(within(screen.getByRole('region', { name: 'Panel layout' })).getByText('Panel layout is not saved: this tab is read-only.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide inspector' }));
    expect(a.panels.getState().inspectorOpen).toBe(false);
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
  });
});
