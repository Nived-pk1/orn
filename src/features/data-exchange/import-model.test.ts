import { describe, expect, it } from 'vitest';
import { APPLIED_OK, blockedPlan, conflictingPlan, fakePorts, plan } from '@/test-support/data-exchange-kit';
import { createImportModel } from './import-model';

const file = (name = 'mine.orn.json'): File => new File(['{}'], name);
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

function start(answer: unknown = { ok: true, plan: plan(), inProcess: false }) {
  const ports = fakePorts();
  ports.preview.mockResolvedValue(answer);
  ports.apply.mockResolvedValue(APPLIED_OK);
  const model = createImportModel(ports);
  return { ports, model, state: () => model.store.getState() };
}

describe('choose and preview', () => {
  it('reads the file, then shows the preview; nothing is applied (INV-21)', async () => {
    const { ports, model, state } = start();
    model.openFile(file());
    expect(state().phase).toBe('reading');
    await settle();
    expect(state().phase).toBe('preview');
    expect(state().plan?.preview.batchId).toBe('batch-1');
    expect(ports.apply).not.toHaveBeenCalled();
  });

  it('the first request: merge when there is data, replace_all when empty or for the bundled demo', async () => {
    const withData = start();
    withData.ports.control.records = 7;
    withData.model.openFile(file());
    expect(withData.ports.preview.mock.calls[0]?.[2]).toEqual({ mode: 'merge' });
    const empty = start();
    empty.model.openFile(file());
    expect(empty.ports.preview.mock.calls[0]?.[2]).toEqual({ mode: 'replace_all' });
    const demo = start();
    demo.ports.control.records = 7;
    demo.model.openBlob(new Blob(['{}']), 'demo.orn.json', { auto: true });
    expect(demo.ports.preview.mock.calls[0]?.[2]).toEqual({ mode: 'replace_all' });
  });

  it('cannot start while the flows say no or an import is open; it says why and changes nothing', async () => {
    const { ports, model, state } = start();
    ports.control.reason = 'this tab is read-only';
    model.openFile(file('a.json'));
    expect(state().phase).toBe('closed');
    expect(state().notice?.text).toBe('The file a.json was not opened: this tab is read-only.');
    expect(ports.preview).not.toHaveBeenCalled();
    ports.control.reason = undefined;
    model.openFile(file('b.json'));
    model.openFile(file('c.json'));
    expect(ports.preview).toHaveBeenCalledTimes(1);
    expect(state().notice?.text).toContain('an import is already open');
  });

  it('a refusal is a screen with its words; Dismiss closes it', async () => {
    const { model, state } = start({ ok: false, code: 'FILE_TOO_LARGE', message: 'big', detail: { size: 60 * 1024 * 1024, cap: 50 * 1024 * 1024 } });
    model.openFile(file('huge.json'));
    await settle();
    expect(state().phase).toBe('refused');
    expect(state().refusal?.title).toBe('The file is too large');
    model.close();
    expect(state().phase).toBe('closed');
  });

  it('the earlier import of the same file is kept for the words', async () => {
    const earlier = { batchId: 'b0', appliedAt: '2026-10-01T00:00:00.000Z', fileName: 'v6.json' };
    const { model, state } = start({ ok: true, plan: plan(), inProcess: false, earlierImport: earlier });
    model.openFile(file('v6.json'));
    await settle();
    expect(state().earlier).toEqual(earlier);
  });

  it('Cancel while reading aborts the call and changes nothing', async () => {
    const { ports, model, state } = start();
    let signal: AbortSignal | undefined;
    ports.preview.mockImplementation((_b: Blob, _n: string, _r: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((resolve) => options.signal.addEventListener('abort', () => resolve({ ok: false, code: 'CANCELLED', message: 'c' })));
    });
    model.openFile(file());
    model.cancel();
    await settle();
    expect(signal?.aborted).toBe(true);
    expect(state().phase).toBe('closed');
    expect(ports.apply).not.toHaveBeenCalled();
  });
});

describe('every choice is a revise of the FULL request', () => {
  it('sends the whole request, shows the answer, and ignores a choice while one is on its way', async () => {
    const { ports, model, state } = start({ ok: true, plan: conflictingPlan(), inProcess: false });
    model.openFile(file());
    await settle();
    ports.revise.mockResolvedValue({ ok: true, plan: plan({ mode: 'merge', conflicts: conflictingPlan().conflicts.map((c) => (c.ref.id === 'spc_2' ? { ...c, resolution: 'replace' as const } : c)) }), inProcess: false });
    model.change({ type: 'resolve', id: 'spc_2', resolution: 'replace' });
    expect(state().revising).toBe(true);
    model.change({ type: 'resolve', id: 'spc_3', resolution: 'replace' });
    await settle();
    expect(ports.revise).toHaveBeenCalledTimes(1);
    expect(ports.revise.mock.calls[0]?.[1]).toEqual({
      mode: 'merge',
      resolutions: [
        { id: 'spc_1', resolution: 'identical_skip' },
        { id: 'spc_2', resolution: 'replace' },
        { id: 'spc_3', resolution: 'keep_current' },
      ],
      excluded: [],
    });
    expect(state().revising).toBe(false);
    expect(state().plan?.conflicts.find((c) => c.ref.id === 'spc_2')?.resolution).toBe('replace');
  });

  it('a choice the flow refuses leaves the plan as it was and says so', async () => {
    const { ports, model, state } = start({ ok: true, plan: blockedPlan(), inProcess: false });
    model.openFile(file());
    await settle();
    ports.revise.mockResolvedValue({ ok: false, code: 'INVALID_REQUEST', message: 'cannot exclude reaction rxn_1: it is not in the import' });
    model.change({ type: 'exclude', ref: { kind: 'reaction', id: 'rxn_1' } as never });
    await settle();
    expect(state().phase).toBe('preview');
    expect(state().plan?.preview.canConfirm).toBe(false);
    expect(state().note).toContain('not in the import');
  });

  it('a lost preview (UNKNOWN_BATCH) is said in words and "Preview the file again" reads the file again', async () => {
    const { ports, model, state } = start();
    model.openFile(file());
    await settle();
    ports.revise.mockResolvedValue({ ok: false, code: 'UNKNOWN_BATCH', message: 'gone' });
    model.change({ type: 'mode', mode: 'merge' });
    await settle();
    expect(state().phase).toBe('refused');
    expect(state().refusal?.text).toMatch(/The preview was lost/);
    expect(state().offer).toBe('preview_again');
    model.acceptOffer();
    await settle();
    expect(ports.preview).toHaveBeenCalledTimes(2);
    expect(state().phase).toBe('preview');
  });
});

describe('Confirm and apply', () => {
  it('a blocked plan cannot be confirmed (INV-21)', async () => {
    const { ports, model, state } = start({ ok: true, plan: blockedPlan(), inProcess: false });
    model.openFile(file());
    await settle();
    model.confirm();
    await settle();
    expect(ports.apply).not.toHaveBeenCalled();
    expect(state().phase).toBe('preview');
  });

  it('applies by stage, says Imported only when saved, and offers Undo import', async () => {
    const { ports, model, state } = start();
    model.openFile(file());
    await settle();
    let release: (value: unknown) => void = () => undefined;
    ports.apply.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    model.confirm();
    ports.setOperation({ kind: 'import_apply', stage: 'snapshot', progress: null });
    expect(state().phase).toBe('applying');
    expect(state().stage).toBe('snapshot');
    expect(state().cancellable).toBe(true);
    ports.setOperation({ kind: 'import_apply', stage: 'committing', progress: null });
    expect(state().cancellable).toBe(false);
    ports.setOperation({ kind: 'import_apply', stage: 'saving', progress: null });
    expect(state().stage).toBe('saving');
    expect(state().notice).toBeUndefined();
    release(APPLIED_OK);
    await settle();
    expect(state().phase).toBe('closed');
    expect(state().notice).toMatchObject({ kind: 'info', text: 'Imported 5 records from mine.orn.json.', offerUndo: true });
  });

  it('Cancel before the commit aborts the apply and returns to the preview with nothing changed', async () => {
    const { ports, model, state } = start();
    model.openFile(file());
    await settle();
    ports.apply.mockImplementation((_b: string, _p: unknown, options: { signal: AbortSignal }) => new Promise((resolve) => options.signal.addEventListener('abort', () => resolve({ ok: false, code: 'CANCELLED', message: 'c' }))));
    model.confirm();
    ports.setOperation({ kind: 'import_apply', stage: 'snapshot', progress: null });
    model.cancel();
    await settle();
    expect(state().phase).toBe('preview');
    expect(state().note).toMatch(/cancelled before anything was changed/);
    expect(state().notice).toBeUndefined();
  });

  it('Cancel after the commit is refused: the apply goes on', async () => {
    const { ports, model, state } = start();
    model.openFile(file());
    await settle();
    let signal: AbortSignal | undefined;
    ports.apply.mockImplementation((_b: string, _p: unknown, options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise(() => undefined);
    });
    model.confirm();
    ports.setOperation({ kind: 'import_apply', stage: 'committing', progress: null });
    model.cancel();
    expect(signal?.aborted).toBe(false);
    expect(state().phase).toBe('applying');
  });

  it('a tab that saves nothing says applied, not saved; an unsaved one says not saved yet', async () => {
    const session = start();
    session.model.openFile(file('x.json'));
    await settle();
    session.ports.apply.mockResolvedValue({ ...APPLIED_OK, saved: false, sessionOnly: true });
    session.model.confirm();
    await settle();
    expect(session.state().notice?.text).toMatch(/^Applied 5 records from x\.json, not saved: nothing is stored in this tab/);
    const unsaved = start();
    unsaved.model.openFile(file('y.json'));
    await settle();
    unsaved.ports.apply.mockResolvedValue({ ...APPLIED_OK, saved: false, save: { lastError: 'disk full' }, reportSaved: false, reportError: 'quota' });
    unsaved.model.confirm();
    await settle();
    expect(unsaved.state().notice?.kind).toBe('warning');
    expect(unsaved.state().notice?.text).toContain('but not saved yet (disk full)');
    expect(unsaved.state().notice?.text).toContain('The import report could not be stored (quota).');
  });

  it.each([
    ['UNKNOWN_BATCH', /The preview was lost/, 'preview_again'],
    ['STALE_REVISION', /Your data changed since the preview/, 'preview_again'],
    ['SNAPSHOT_FAILED', /nothing was imported/, undefined],
  ])('a failed apply (%s) is plain words and nothing is claimed', async (code, text, offer) => {
    const { ports, model, state } = start();
    model.openFile(file());
    await settle();
    ports.apply.mockResolvedValue({ ok: false, code, message: 'detail' });
    model.confirm();
    await settle();
    expect(state().phase).toBe('refused');
    expect(state().refusal?.text).toMatch(text);
    expect(state().offer).toBe(offer);
    expect(state().notice).toBeUndefined();
  });

  it('a worker that is down offers the in-page path and does not take it by itself', async () => {
    const { ports, model, state } = start();
    model.openFile(file());
    await settle();
    ports.apply.mockResolvedValue({ ok: false, code: 'WORKER_DOWN', message: 'gone', inProcessAvailable: true });
    model.confirm();
    await settle();
    expect(state().offer).toBe('in_process');
    expect(ports.preview).toHaveBeenCalledTimes(1);
    model.acceptOffer();
    await settle();
    expect(ports.preview).toHaveBeenCalledTimes(2);
    expect(ports.preview.mock.calls[1]?.[3]).toMatchObject({ inProcess: true });
  });

  it('the bundled demo applies without a preview step when nothing blocks, and shows the preview when something does', async () => {
    const ok = start();
    ok.model.openBlob(new Blob(['{}']), 'demo.orn.json', { auto: true });
    await settle();
    expect(ok.ports.apply).toHaveBeenCalledTimes(1);
    expect(ok.state().notice?.text).toBe('Imported 5 records from demo.orn.json.');
    const blocked = start({ ok: true, plan: blockedPlan(), inProcess: false });
    blocked.model.openBlob(new Blob(['{}']), 'demo.orn.json', { auto: true });
    await settle();
    expect(blocked.ports.apply).not.toHaveBeenCalled();
    expect(blocked.state().phase).toBe('preview');
  });
});

describe('Undo import', () => {
  it('says what it undoes and what is back', async () => {
    const { ports, model, state } = start();
    ports.control.records = 26;
    ports.undo.mockResolvedValue({ ok: true, saved: true, sessionOnly: false, notes: [] });
    model.undoImport();
    await settle();
    expect(state().phase).toBe('closed');
    expect(state().notice?.text).toBe('Import undone: the data from before it is back. That was the import of earlier.orn.json; the dataset holds 26 records again.');
    expect(state().notice?.offerUndo).toBe(false);
  });

  it('with no import it says so; a refusal says why', async () => {
    const none = start();
    none.ports.lastImport.mockResolvedValue(undefined);
    none.model.undoImport();
    await settle();
    expect(none.state().notice?.text).toBe('There is no import to undo.');
    expect(none.ports.undo).not.toHaveBeenCalled();
    const refused = start();
    refused.ports.undo.mockResolvedValue({ ok: false, code: 'READ_ONLY', message: 'follower' });
    refused.model.undoImport();
    await settle();
    expect(refused.state().notice?.text).toMatch(/^The import of earlier\.orn\.json was not undone\. This tab cannot change the data/);
    const blocked = start();
    blocked.ports.control.reason = 'another operation is running';
    blocked.model.undoImport();
    await settle();
    expect(blocked.state().notice?.text).toBe('Undo import is not available now: another operation is running.');
  });

  it('a session-only tab says it is not saved', async () => {
    const { ports, model, state } = start();
    ports.undo.mockResolvedValue({ ok: true, saved: false, sessionOnly: true, notes: [] });
    model.undoImport();
    await settle();
    expect(state().notice?.text).toContain('Not saved: nothing is stored in this tab.');
  });
});
