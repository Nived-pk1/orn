import { describe, expect, it } from 'vitest';
import { createExportModel } from './export-model';
import { fakePorts, OK_RESULT } from '@/test-support/export-ports';

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the export model', () => {
  it('opens with a name from the dataset title and the injected date, and the options as defaults', () => {
    const model = createExportModel(fakePorts({ title: 'My ../ dataset' }));
    model.open();
    expect(model.store.getState()).toMatchObject({ phase: 'options', format: 'orn.json', scope: 'full', images: 'none', base: 'My-dataset-2026-10-12' });
  });

  it('runs one export with the chosen options, hands the file to save and says what was written', async () => {
    const ports = fakePorts();
    const model = createExportModel(ports);
    model.open();
    model.setScope('chemistry');
    model.setBase('backup one');
    model.start();
    expect(model.store.getState().phase).toBe('running');
    expect(ports.run.mock.calls[0]?.[0]).toEqual({ scope: 'chemistry', includeDependencies: true, assets: 'none' });
    expect(ports.run.mock.calls[0]?.[1]).toBe('orn.json');
    ports.lastFlow().onProgress?.(1, 1, 'serialize');
    expect(model.store.getState().progress).toBe('Writing the file');
    ports.finish({ ok: true, result: OK_RESULT, inProcess: false });
    await flush();
    const state = model.store.getState();
    expect(state.phase).toBe('done');
    expect(state.written).toMatchObject({ fileName: 'backup-one.orn.json', counts: '3 species, 2 reactions', total: 5 });
    expect(ports.save).toHaveBeenCalledTimes(1);
    const [blob, name] = ports.save.mock.calls[0] ?? [];
    expect(name).toBe('backup-one.orn.json');
    expect((blob as Blob).type).toBe('application/json');
    expect((blob as Blob).size).toBe(OK_RESULT.bytes.length);
  });

  it('the package format and "in the package" are sent together; switching the format moves the images choice', async () => {
    const ports = fakePorts({ images: { count: 2, bytes: 4096 } });
    const model = createExportModel(ports);
    model.open();
    model.setImages('embed');
    model.setFormat('ornpkg');
    expect(model.store.getState().images).toBe('package');
    model.start();
    expect(ports.run.mock.calls[0]?.[0]).toMatchObject({ assets: 'package' });
    expect(ports.run.mock.calls[0]?.[1]).toBe('ornpkg');
    ports.finish({ ok: true, result: OK_RESULT, inProcess: false });
    await flush();
    expect(ports.save.mock.calls[0]?.[1]).toMatch(/\.ornpkg$/);
    expect((ports.save.mock.calls[0]?.[0] as Blob).type).toBe('application/zip');
  });

  it('Cancel while running gives no file and says so; an answer that arrives after it is not saved', async () => {
    const ports = fakePorts();
    const model = createExportModel(ports);
    model.open();
    model.start();
    const { signal } = ports.lastFlow();
    model.cancel();
    expect(signal?.aborted).toBe(true);
    expect(model.store.getState().phase).toBe('cancelled');
    ports.finish({ ok: true, result: OK_RESULT, inProcess: false });
    await flush();
    expect(model.store.getState().phase).toBe('cancelled');
    expect(ports.save).not.toHaveBeenCalled();
  });

  it('a cancelled answer from the flow is a cancel too', async () => {
    const ports = fakePorts();
    const model = createExportModel(ports);
    model.open();
    model.start();
    ports.finish({ ok: false, code: 'CANCELLED', message: 'cancelled' });
    await flush();
    expect(model.store.getState().phase).toBe('cancelled');
    expect(ports.save).not.toHaveBeenCalled();
  });

  it('a worker that is down is an offer; the second run asks for the page path and nothing was saved before', async () => {
    const ports = fakePorts();
    const model = createExportModel(ports);
    model.open();
    model.start();
    ports.finish({ ok: false, code: 'WORKER_DOWN', message: 'no compute worker', inProcessAvailable: true });
    await flush();
    expect(model.store.getState()).toMatchObject({ phase: 'refused', offerInProcess: true });
    expect(ports.save).not.toHaveBeenCalled();
    expect(ports.run).toHaveBeenCalledTimes(1);
    expect(ports.lastFlow().inProcess).toBe(false);
    model.start(true);
    expect(ports.lastFlow().inProcess).toBe(true);
    ports.finish({ ok: true, result: OK_RESULT, inProcess: true });
    await flush();
    expect(model.store.getState().written?.inProcess).toBe(true);
  });

  it('missing images and references are reported in the result, never silent', async () => {
    const ports = fakePorts();
    const model = createExportModel(ports);
    model.open();
    model.start();
    ports.finish({
      ok: true,
      result: { ...OK_RESULT, missingAssets: [{ assetId: 'ast_one' as never, sha256: 'a'.repeat(64), reason: 'no_bytes' }] },
      inProcess: false,
    });
    await flush();
    expect(model.store.getState().written?.missingAssets).toEqual(['Image asset benzene.png (ast_one): its picture is not stored on this device']);
  });

  it('another operation running blocks Export and says why; the options stay editable', () => {
    const ports = fakePorts();
    ports.blocked = 'another operation is running';
    const model = createExportModel(ports);
    model.open();
    expect(model.store.getState().blocked).toBe('another operation is running');
    model.start();
    expect(ports.run).not.toHaveBeenCalled();
  });

  it('closing while it runs stops it and nothing is saved', async () => {
    const ports = fakePorts();
    const model = createExportModel(ports);
    model.open();
    model.start();
    model.close();
    ports.finish({ ok: true, result: OK_RESULT, inProcess: false });
    await flush();
    expect(model.store.getState().phase).toBe('closed');
    expect(ports.save).not.toHaveBeenCalled();
  });

  it('"save again" gives the same file once more; a save that throws is said in words', async () => {
    const ports = fakePorts();
    const model = createExportModel(ports);
    model.open();
    model.start();
    ports.finish({ ok: true, result: OK_RESULT, inProcess: false });
    await flush();
    model.saveAgain();
    expect(ports.save).toHaveBeenCalledTimes(2);
    expect(ports.save.mock.calls[1]?.[1]).toBe(ports.save.mock.calls[0]?.[1]);

    const failing = fakePorts();
    failing.save.mockImplementation(() => {
      throw new Error('blocked by the browser');
    });
    const second = createExportModel(failing);
    second.open();
    second.start();
    failing.finish({ ok: true, result: OK_RESULT, inProcess: false });
    await flush();
    expect(second.store.getState().phase).toBe('refused');
    expect(second.store.getState().refusal?.text).toContain('blocked by the browser');
  });
});
