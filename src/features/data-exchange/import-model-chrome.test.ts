/** What a student is told after an import (step 8.3, C3): the first load of the published dataset is quiet; a visitor's own file keeps its notice with Undo and counts as own data. */
import { describe, expect, it, vi } from 'vitest';
import { APPLIED_OK, fakePorts, plan } from '@/test-support/data-exchange-kit';
import { createImportModel } from './import-model';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

function rig(options: Parameters<typeof createImportModel>[1], records = 0) {
  const ports = fakePorts();
  ports.control.records = records;
  ports.preview.mockResolvedValue({ ok: true, plan: plan(), inProcess: false });
  ports.apply.mockResolvedValue(APPLIED_OK);
  return { model: createImportModel(ports, options) };
}

describe('quiet automatic loads', () => {
  it('an automatic load (the published dataset) says nothing when it is quiet, and does not count as own data', async () => {
    const onOwnData = vi.fn();
    const { model } = rig({ quietAuto: true, onOwnDataApplied: onOwnData });
    model.openBlob(new Blob(['{}']), 'dataset.orn.json', { auto: true });
    await settle();
    expect(model.store.getState().notice).toBeUndefined();
    expect(onOwnData).not.toHaveBeenCalled();
  });
  it('an automatic load that REPLACES data (the update notice Load it) keeps its notice and its Undo import: the visitor may lose something', async () => {
    const { model } = rig({ quietAuto: true }, 7);
    model.openBlob(new Blob(['{}']), 'dataset.orn.json', { auto: true });
    await settle();
    expect(model.store.getState().notice?.offerUndo).toBe(true);
  });
  it('without the option the automatic load keeps its notice (Studio)', async () => {
    const { model } = rig({});
    model.openBlob(new Blob(['{}']), 'demo.orn.json', { auto: true });
    await settle();
    expect(model.store.getState().notice?.text).toMatch(/^Imported \d+ records from demo\.orn\.json/);
  });
  it("a visitor's own file keeps its notice with Undo and is reported as own data, quiet or not", async () => {
    const onOwnData = vi.fn();
    const { model } = rig({ quietAuto: true, onOwnDataApplied: onOwnData });
    model.openFile(new File(['{}'], 'mine.orn.json'));
    await settle();
    expect(model.store.getState().phase).toBe('preview');
    model.confirm();
    await settle();
    expect(model.store.getState().notice?.text).toMatch(/^Imported \d+ records from mine\.orn\.json/);
    expect(model.store.getState().notice?.offerUndo).toBe(true);
    expect(onOwnData).toHaveBeenCalledTimes(1);
  });
  it('a warning of a quiet automatic load is still said (nothing silent)', async () => {
    const ports = fakePorts();
    ports.preview.mockResolvedValue({ ok: true, plan: plan(), inProcess: false });
    ports.apply.mockResolvedValue({ ...APPLIED_OK, notes: ['Two records were set aside'] });
    const model = createImportModel(ports, { quietAuto: true });
    model.openBlob(new Blob(['{}']), 'dataset.orn.json', { auto: true });
    await settle();
    expect(model.store.getState().notice?.kind).toBe('warning');
  });
});
