/** Undo import asks before it throws away later work (step 8.4s, S1), and says why when it is not available. */
import { describe, expect, it } from 'vitest';
import { fakePorts } from '@/test-support/data-exchange-kit';
import { createImportModel } from './import-model';

const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
};
const OK = { ok: true, saved: true, sessionOnly: false, notes: [] };
const SINCE = (n: number) => ({ ok: false, code: 'CHANGED_SINCE', discardedRevisions: n, message: 'x' });

function rig() {
  const ports = fakePorts();
  ports.control.records = 26;
  const model = createImportModel(ports);
  return { ports, model, state: () => model.store.getState() };
}

describe('Undo import with later changes', () => {
  it('opens the question with the number of changes; nothing is undone yet', async () => {
    const { ports, model, state } = rig();
    ports.undo.mockResolvedValueOnce(SINCE(3));
    model.undoImport();
    await settle();
    expect(state().phase).toBe('undo_question');
    expect(state().later).toBe(3);
    expect(ports.undo).toHaveBeenCalledTimes(1);
    expect(ports.undo).toHaveBeenCalledWith(undefined);
  });
  it('Cancel closes it and changes nothing', async () => {
    const { ports, model, state } = rig();
    ports.undo.mockResolvedValueOnce(SINCE(1));
    model.undoImport();
    await settle();
    model.cancel();
    expect(state().phase).toBe('closed');
    expect(ports.undo).toHaveBeenCalledTimes(1);
  });
  it('"Undo import anyway" asks the flow again with the explicit choice and then says what is back', async () => {
    const { ports, model, state } = rig();
    ports.undo.mockResolvedValueOnce(SINCE(2)).mockResolvedValueOnce(OK);
    model.undoImport();
    await settle();
    model.undoAnyway();
    await settle();
    expect(ports.undo).toHaveBeenLastCalledWith({ discardLaterChanges: true });
    expect(state().phase).toBe('closed');
    expect(state().notice?.text).toMatch(/^Import undone: the data from before it is back\./);
  });
  it('an import that was undone already says so', async () => {
    const { ports, model, state } = rig();
    ports.undo.mockResolvedValueOnce({ ok: false, code: 'ALREADY_UNDONE', message: 'the newest import was undone already' });
    model.undoImport();
    await settle();
    expect(state().phase).toBe('closed');
    expect(state().notice?.text).toMatch(/was undone already/);
  });
});
