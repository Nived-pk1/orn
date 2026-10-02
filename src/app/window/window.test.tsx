// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { tierState } from '@/test-support/perf-kit';
import { fakeApp, planOf, renderWithApp, type FakeApp } from '@/test-support/window-kit';

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
    expect(screen.getByText('Starting up…')).toBeTruthy();
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
    expect(a.flows.apply).toHaveBeenCalledWith('batch-1', expect.objectContaining({ mode: 'replace_all' }), { inProcess: false });
  });

  it('a demo plan that cannot be confirmed shows its blockers and is not applied', async () => {
    const a = app();
    a.flows.preview.mockResolvedValue({ ok: true, plan: planOf({ canConfirm: false, blockers: ['REF-001 on spc_x'] }), inProcess: false });
    renderWithApp(a);
    fireEvent.click(button('Load demo dataset'));
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(within(screen.getByRole('list', { name: 'Blockers' })).getByText('REF-001 on spc_x')).toBeTruthy();
    expect((button('Confirm') as HTMLButtonElement).disabled).toBe(true);
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
    renderWithApp(app());
    fireEvent.click(button('Start empty'));
    expect(screen.queryByRole('region', { name: 'First run' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Dataset' })).toBeTruthy();
    expect(screen.getByText('The dataset is empty.')).toBeTruthy();
    expect(screen.getByText(/Started empty/)).toBeTruthy();
  });
});

describe('Import a file', () => {
  it('shows a plain summary (counts per kind, findings, decisions at their defaults), then Confirm applies', async () => {
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
    expect(kinds.getByText('species: 3 incoming (3 new, 0 identical, 0 conflicting)')).toBeTruthy();
    expect(kinds.getByText('reaction: 2 incoming (2 new, 0 identical, 0 conflicting)')).toBeTruthy();
    expect(screen.getByText('Findings in the result: E 0 / W 1 / I 0 / Review 0.')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Decisions' })).getByText('Which hub class? a')).toBeTruthy();
    expect(screen.getByText('Migrations applied to the file: v1-to-v2.')).toBeTruthy();
    expect(a.flows.apply).not.toHaveBeenCalled();
    fireEvent.click(button('Confirm'));
    await screen.findByText('Imported 5 records from mine.orn.json.');
    expect(a.flows.apply).toHaveBeenCalledWith('batch-1', expect.objectContaining({ mode: 'replace_all' }), { inProcess: false });
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

  it('blockers disable Confirm', async () => {
    const a = app();
    a.flows.preview.mockResolvedValue({ ok: true, inProcess: false, plan: planOf({ canConfirm: false, blockers: ['an ERROR in the merged result'] }) });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    expect((button('Confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('an ERROR in the merged result')).toBeTruthy();
  });

  it('INVALID_META is said in words and merge is offered', async () => {
    const a = app();
    a.flows.preview.mockResolvedValueOnce({ ok: false, code: 'INVALID_META', message: 'datasetId is empty' });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByText(/dataset information was refused \(datasetId is empty\)/);
    fireEvent.click(button('Merge instead'));
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(a.flows.preview.mock.calls[1]?.[2]).toEqual({ mode: 'merge' });
  });

  it('a worker that is down offers the in-page path, and the second ask uses it', async () => {
    const a = app();
    a.flows.preview.mockResolvedValueOnce({ ok: false, code: 'WORKER_DOWN', message: 'no compute worker', inProcessAvailable: true });
    a.flows.preview.mockResolvedValueOnce({ ok: true, plan: planOf(), inProcess: true });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByText(/background worker is down \(no compute worker\)/);
    fireEvent.click(button('Run on this page'));
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(a.flows.preview.mock.calls[1]?.[3]).toMatchObject({ inProcess: true });
    fireEvent.click(button('Confirm'));
    await waitFor(() => expect(a.flows.apply).toHaveBeenCalled());
    expect(a.flows.apply.mock.calls[0]?.[2]).toEqual({ inProcess: true });
  });

  it('refusals are plain text with their code; Dismiss clears them', async () => {
    const a = app();
    a.flows.preview.mockResolvedValueOnce({ ok: false, code: 'NEWER_SCHEMA', message: 'schema 9 is newer' });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByText('The file was not imported (NEWER_SCHEMA): schema 9 is newer');
    fireEvent.click(button('Dismiss'));
    expect(screen.queryByText(/NEWER_SCHEMA/)).toBeNull();
  });

  it('an apply that is refused says so; an apply that is not saved yet says "not saved"', async () => {
    const a = app();
    a.flows.apply.mockResolvedValueOnce({ ok: false, code: 'STALE_REVISION', message: 'the data changed' });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    fireEvent.click(button('Confirm'));
    await screen.findByText('The import was not applied (STALE_REVISION): the data changed');
    cleanup();
    const b = app();
    b.flows.apply.mockResolvedValueOnce({ ...APPLIED, saved: false, save: null, notes: ['a note'], reportSaved: false, reportError: 'quota' });
    renderWithApp(b);
    choose('y.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    fireEvent.click(button('Confirm'));
    await screen.findByText(/Applied 5 records from y\.orn\.json, but not saved yet/);
    expect(screen.getByText('a note')).toBeTruthy();
    expect(screen.getByText('The import report could not be stored (quota).')).toBeTruthy();
  });

  it('a session-only import says nothing is saved', async () => {
    const a = app({ status: { mode: 'session_only', save: null } });
    a.flows.apply.mockResolvedValueOnce({ ...APPLIED, saved: false, sessionOnly: true });
    renderWithApp(a);
    choose('x.orn.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    fireEvent.click(button('Confirm'));
    await screen.findByText('Imported 5 records from x.orn.json. Nothing is saved in this session.');
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
    await screen.findByText('Reading big.orn.json…');
    fireEvent.click(button('Cancel'));
    await waitFor(() => expect(screen.queryByText(/Reading big/)).toBeNull());
    expect(signal?.aborted).toBe(true);
  });

  it('a hostile file name is shown as text', async () => {
    const a = app();
    renderWithApp(a);
    choose('<img src=x onerror=alert(1)>.json');
    await screen.findByRole('heading', { name: 'Import summary' });
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('heading', { name: '<img src=x onerror=alert(1)>.json' })).toBeTruthy();
  });
});

describe('a dataset with data', () => {
  it('shows the record counts per kind and no first-run buttons; the result of an import stays visible', async () => {
    const a = app({ state: tierState('tiny', 'dense') });
    renderWithApp(a);
    expect(screen.queryByRole('region', { name: 'First run' })).toBeNull();
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
    expect(screen.getByRole('region', { name: 'Dataset' })).toBeTruthy();
    expect(screen.getByText('Imported 5 records from demo.orn.json.')).toBeTruthy();
  });
});
